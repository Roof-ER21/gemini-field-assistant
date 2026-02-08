/**
 * InspectionUploader - Multi-photo upload with drag & drop
 * Handles roof inspection photo uploads with AI analysis trigger
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { analyzeImage } from '../services/geminiService';

interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'analyzing' | 'complete' | 'error';
  analysis?: PhotoAnalysis;
  error?: string;
}

export interface PhotoAnalysis {
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  location: string;
  description: string;
  recommendations: string[];
  insuranceRelevant: boolean;
  estimatedRepairCost?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

interface InspectionUploaderProps {
  onPhotosAnalyzed?: (photos: UploadedPhoto[]) => void;
  maxPhotos?: number;
}

export const InspectionUploader: React.FC<InspectionUploaderProps> = ({
  onPhotosAnalyzed,
  maxPhotos = 20
}) => {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files).filter(file =>
      file.type.startsWith('image/')
    ).slice(0, maxPhotos - photos.length);

    if (fileArray.length === 0) return;

    const newPhotos: UploadedPhoto[] = fileArray.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading'
    }));

    setPhotos(prev => [...prev, ...newPhotos]);

    // Auto-analyze uploaded photos
    analyzePhotos(newPhotos);
  }, [photos.length, maxPhotos]);

  // Analyze photos with Gemini AI
  const analyzePhotos = async (photosToAnalyze: UploadedPhoto[]) => {
    setIsAnalyzing(true);

    for (const photo of photosToAnalyze) {
      try {
        // Update status to analyzing
        setPhotos(prev => prev.map(p =>
          p.id === photo.id ? { ...p, status: 'analyzing' } : p
        ));

        // Convert image to base64
        const base64 = await fileToBase64(photo.file);

        // Analyze with Gemini
        const prompt = `You are a professional roof inspector. Analyze this roof inspection photo and provide detailed information in the following JSON format:
{
  "damageType": "type of damage (e.g., 'Shingle damage', 'Flashing issue', 'Hail damage', 'Wind damage', 'Wear and tear')",
  "severity": "minor|moderate|severe|critical",
  "location": "location on roof (e.g., 'Ridge line', 'Valley', 'South facing slope')",
  "description": "detailed description of what you see",
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "insuranceRelevant": true/false,
  "estimatedRepairCost": "cost range (e.g., '$500-$1,000')",
  "urgency": "low|medium|high|critical"
}

Focus on insurance-relevant damage, safety concerns, and actionable recommendations.`;

        const response = await analyzeImage(base64, photo.file.type, prompt);

        // Parse AI response
        let analysis: PhotoAnalysis;
        try {
          // Try to extract JSON from response
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          } else {
            // Fallback parsing
            analysis = {
              damageType: 'Roof damage detected',
              severity: 'moderate',
              location: 'Unknown',
              description: response.substring(0, 200),
              recommendations: ['Professional inspection recommended'],
              insuranceRelevant: true,
              urgency: 'medium'
            };
          }
        } catch (parseError) {
          analysis = {
            damageType: 'Analysis available',
            severity: 'moderate',
            location: 'See description',
            description: response.substring(0, 300),
            recommendations: ['Review full analysis'],
            insuranceRelevant: true,
            urgency: 'medium'
          };
        }

        // Update photo with analysis
        setPhotos(prev => prev.map(p =>
          p.id === photo.id
            ? { ...p, status: 'complete', analysis }
            : p
        ));

      } catch (error) {
        console.error('Error analyzing photo:', error);
        setPhotos(prev => prev.map(p =>
          p.id === photo.id
            ? { ...p, status: 'error', error: 'Analysis failed' }
            : p
        ));
      }
    }

    setIsAnalyzing(false);

    // Notify parent component
    const updatedPhotos = photos.filter(p => p.status === 'complete');
    if (onPhotosAnalyzed && updatedPhotos.length > 0) {
      onPhotosAnalyzed(updatedPhotos);
    }
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // Remove photo
  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const updated = prev.filter(p => p.id !== id);
      const photo = prev.find(p => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.preview);
      }
      return updated;
    });
  };

  // Open file picker
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Calculate progress
  const completedCount = photos.filter(p => p.status === 'complete').length;
  const progress = photos.length > 0 ? (completedCount / photos.length) * 100 : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-[#e94560]" />
          Upload Inspection Photos
        </CardTitle>
        <CardDescription>
          Upload roof inspection photos for AI analysis. Drag & drop or click to browse.
          {photos.length > 0 && ` (${photos.length}/${maxPhotos})`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleUploadClick}
          className={`
            relative overflow-hidden rounded-2xl p-10 text-center cursor-pointer
            transition-all duration-300 ease-out
            ${isDragging
              ? 'bg-[#e94560]/20 ring-2 ring-[#e94560] shadow-xl shadow-[#e94560]/20 scale-[1.02]'
              : 'bg-zinc-900/60 hover:bg-zinc-800/80 ring-1 ring-zinc-700/50 hover:ring-zinc-600'
            }
          `}
        >
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />

          <div className="relative z-10">
            <div className={`
              w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center
              transition-all duration-300
              ${isDragging
                ? 'bg-[#e94560] shadow-lg shadow-[#e94560]/40 scale-110'
                : 'bg-zinc-800 ring-1 ring-zinc-700'
              }
            `}>
              <Upload className={`w-10 h-10 transition-colors ${isDragging ? 'text-white' : 'text-zinc-400'}`} />
            </div>

            <p className="text-lg font-semibold text-white mb-2">
              {isDragging ? 'Drop photos to upload' : 'Drop photos here or click to browse'}
            </p>
            <p className="text-zinc-500 text-sm">
              Supports JPG, PNG, HEIC • Max {maxPhotos} photos
            </p>

            {/* Upload hint badges */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium">
                AI Analysis
              </span>
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium">
                Insurance Ready
              </span>
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium">
                Auto Presentation
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {photos.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/80">
                {isAnalyzing ? 'Analyzing photos...' : `${completedCount} of ${photos.length} analyzed`}
              </span>
              <span className="text-white/80">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#e94560] to-[#ff6b88] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Photo Grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map(photo => (
              <div
                key={photo.id}
                className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40"
              >
                <img
                  src={photo.preview}
                  alt="Inspection"
                  className="w-full h-full object-cover"
                />

                {/* Status Overlay */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                  {photo.status === 'uploading' && (
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  )}
                  {photo.status === 'analyzing' && (
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 text-[#e94560] animate-spin mx-auto mb-2" />
                      <p className="text-xs text-white">Analyzing...</p>
                    </div>
                  )}
                  {photo.status === 'complete' && (
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  )}
                  {photo.status === 'error' && (
                    <div className="text-center">
                      <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                      <p className="text-xs text-white">{photo.error}</p>
                    </div>
                  )}
                </div>

                {/* Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(photo.id);
                  }}
                  className="absolute top-2 right-2 p-1 bg-black/80 rounded-full hover:bg-red-500 transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>

                {/* Severity Badge */}
                {photo.analysis && (
                  <div className={`
                    absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-medium
                    ${photo.analysis.severity === 'critical' ? 'bg-red-500 text-white' : ''}
                    ${photo.analysis.severity === 'severe' ? 'bg-orange-500 text-white' : ''}
                    ${photo.analysis.severity === 'moderate' ? 'bg-yellow-500 text-black' : ''}
                    ${photo.analysis.severity === 'minor' ? 'bg-green-500 text-white' : ''}
                  `}>
                    {photo.analysis.severity}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {photos.length > 0 && completedCount > 0 && (
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                photos.forEach(p => URL.revokeObjectURL(p.preview));
                setPhotos([]);
              }}
            >
              Clear All
            </Button>
            <Button
              onClick={() => {
                const completedPhotos = photos.filter(p => p.status === 'complete');
                if (onPhotosAnalyzed) {
                  onPhotosAnalyzed(completedPhotos);
                }
              }}
              disabled={completedCount === 0}
            >
              Generate Presentation ({completedCount})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InspectionUploader;
