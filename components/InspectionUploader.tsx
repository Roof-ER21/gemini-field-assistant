/**
 * InspectionUploader - Premium SaaS Photo Upload
 * Clean, professional photo upload with AI analysis
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle, CheckCircle2, CloudUpload, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
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
    analyzePhotos(newPhotos);
  }, [photos.length, maxPhotos]);

  const analyzePhotos = async (photosToAnalyze: UploadedPhoto[]) => {
    setIsAnalyzing(true);

    for (const photo of photosToAnalyze) {
      try {
        setPhotos(prev => prev.map(p =>
          p.id === photo.id ? { ...p, status: 'analyzing' } : p
        ));

        const base64 = await fileToBase64(photo.file);

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

        let analysis: PhotoAnalysis;
        try {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          } else {
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

    const updatedPhotos = photos.filter(p => p.status === 'complete');
    if (onPhotosAnalyzed && updatedPhotos.length > 0) {
      onPhotosAnalyzed(updatedPhotos);
    }
  };

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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const completedCount = photos.filter(p => p.status === 'complete').length;
  const progress = photos.length > 0 ? (completedCount / photos.length) * 100 : 0;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white';
      case 'severe': return 'bg-orange-500 text-white';
      case 'moderate': return 'bg-amber-500 text-white';
      case 'minor': return 'bg-emerald-500 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleUploadClick}
        className={`
          relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer
          transition-all duration-300 ease-out
          ${isDragging
            ? 'border-rose-400 bg-rose-50 scale-[1.01]'
            : 'border-slate-200 bg-slate-50/50 hover:border-rose-300 hover:bg-rose-50/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        <div className={`
          w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
          transition-all duration-300
          ${isDragging
            ? 'bg-rose-500 shadow-lg shadow-rose-200 scale-110'
            : 'bg-slate-100'
          }
        `}>
          <CloudUpload className={`w-8 h-8 transition-colors ${isDragging ? 'text-white' : 'text-slate-400'}`} />
        </div>

        <p className="text-lg font-semibold text-slate-700 mb-1">
          {isDragging ? 'Drop to upload' : 'Drop photos here or click to browse'}
        </p>
        <p className="text-sm text-slate-500">
          JPG, PNG, HEIC up to 10MB • Max {maxPhotos} photos
        </p>

        {/* Feature tags */}
        <div className="flex items-center justify-center gap-3 mt-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-600">
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            AI Analysis
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Insurance Ready
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      {photos.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 font-medium">
              {isAnalyzing ? 'Analyzing photos...' : `${completedCount} of ${photos.length} analyzed`}
            </span>
            <span className="text-slate-600 font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-500 ease-out rounded-full"
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
              className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <img
                src={photo.preview}
                alt="Inspection"
                className="w-full h-full object-cover"
              />

              {/* Status Overlay */}
              {photo.status !== 'complete' && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center">
                  {photo.status === 'uploading' && (
                    <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                  )}
                  {photo.status === 'analyzing' && (
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-rose-100 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-rose-500 animate-pulse" />
                      </div>
                      <p className="text-xs font-medium text-slate-600">Analyzing...</p>
                    </div>
                  )}
                  {photo.status === 'error' && (
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-red-100 flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                      </div>
                      <p className="text-xs font-medium text-red-600">{photo.error}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Complete indicator */}
              {photo.status === 'complete' && (
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}

              {/* Remove Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removePhoto(photo.id);
                }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
              >
                <X className="w-4 h-4 text-slate-600 hover:text-red-600" />
              </button>

              {/* Severity Badge */}
              {photo.analysis && (
                <div className={`
                  absolute bottom-2 left-2 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-lg
                  ${getSeverityColor(photo.analysis.severity)}
                `}>
                  {photo.analysis.severity.charAt(0).toUpperCase() + photo.analysis.severity.slice(1)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {photos.length > 0 && completedCount > 0 && (
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              photos.forEach(p => URL.revokeObjectURL(p.preview));
              setPhotos([]);
            }}
            className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
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
            className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-6"
          >
            Continue with {completedCount} Photo{completedCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  );
};

export default InspectionUploader;
