/**
 * InspectionUploader - Colorful SaaS Photo Upload
 * Beautiful upload zone with forced light theme
 */

import React, { useState, useCallback, useRef } from 'react';
import { X, Loader2, AlertCircle, CheckCircle2, CloudUpload, Sparkles } from 'lucide-react';
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

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: '#EF4444', color: 'white' };
      case 'severe': return { bg: '#F97316', color: 'white' };
      case 'moderate': return { bg: '#F59E0B', color: 'white' };
      case 'minor': return { bg: '#22C55E', color: 'white' };
      default: return { bg: '#64748B', color: 'white' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Upload Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleUploadClick}
        style={{
          position: 'relative',
          borderRadius: '16px',
          border: isDragging ? '2px dashed #3B82F6' : '2px dashed #CBD5E1',
          padding: '48px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          background: isDragging
            ? 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)'
            : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
          transform: isDragging ? 'scale(1.01)' : 'scale(1)'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />

        <div
          style={{
            width: '72px',
            height: '72px',
            margin: '0 auto 20px',
            borderRadius: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            background: isDragging
              ? 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)'
              : 'linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)',
            boxShadow: isDragging
              ? '0 10px 30px -10px rgba(59, 130, 246, 0.5)'
              : '0 4px 12px -4px rgba(0, 0, 0, 0.1)',
            transform: isDragging ? 'scale(1.1)' : 'scale(1)'
          }}
        >
          <CloudUpload style={{
            width: '36px',
            height: '36px',
            color: isDragging ? 'white' : '#64748B',
            transition: 'color 0.3s ease'
          }} />
        </div>

        <p style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#1E293B',
          margin: '0 0 6px 0'
        }}>
          {isDragging ? 'Drop to upload' : 'Drop photos here or click to browse'}
        </p>
        <p style={{
          fontSize: '14px',
          color: '#64748B',
          margin: 0
        }}>
          JPG, PNG, HEIC up to 10MB • Max {maxPhotos} photos
        </p>

        {/* Feature tags */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          marginTop: '20px'
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '20px',
            background: 'white',
            border: '1px solid #E2E8F0',
            fontSize: '13px',
            fontWeight: '500',
            color: '#475569',
            boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08)'
          }}>
            <Sparkles style={{ width: '15px', height: '15px', color: '#8B5CF6' }} />
            AI Analysis
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '20px',
            background: 'white',
            border: '1px solid #E2E8F0',
            fontSize: '13px',
            fontWeight: '500',
            color: '#475569',
            boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08)'
          }}>
            <CheckCircle2 style={{ width: '15px', height: '15px', color: '#22C55E' }} />
            Insurance Ready
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: '#475569', fontWeight: '500' }}>
              {isAnalyzing ? 'Analyzing photos...' : `${completedCount} of ${photos.length} analyzed`}
            </span>
            <span style={{ color: '#475569', fontWeight: '600' }}>{Math.round(progress)}%</span>
          </div>
          <div style={{
            height: '10px',
            background: '#E2E8F0',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
                transition: 'width 0.5s ease-out',
                borderRadius: '10px',
                width: `${progress}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px'
        }}>
          {photos.map(photo => {
            const severityStyle = photo.analysis ? getSeverityStyle(photo.analysis.severity) : null;

            return (
              <div
                key={photo.id}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 4px 12px -4px rgba(0, 0, 0, 0.1)'
                }}
              >
                <img
                  src={photo.preview}
                  alt="Inspection"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />

                {/* Status Overlay */}
                {photo.status !== 'complete' && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {photo.status === 'uploading' && (
                      <Loader2 style={{
                        width: '32px',
                        height: '32px',
                        color: '#94A3B8',
                        animation: 'spin 1s linear infinite'
                      }} />
                    )}
                    {photo.status === 'analyzing' && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          margin: '0 auto 8px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Sparkles style={{
                            width: '24px',
                            height: '24px',
                            color: '#8B5CF6'
                          }} />
                        </div>
                        <p style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#64748B',
                          margin: 0
                        }}>Analyzing...</p>
                      </div>
                    )}
                    {photo.status === 'error' && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          margin: '0 auto 8px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <AlertCircle style={{ width: '24px', height: '24px', color: '#EF4444' }} />
                        </div>
                        <p style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#EF4444',
                          margin: 0
                        }}>{photo.error}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Complete indicator */}
                {photo.status === 'complete' && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px -2px rgba(34, 197, 94, 0.5)'
                  }}>
                    <CheckCircle2 style={{ width: '16px', height: '16px', color: 'white' }} />
                  </div>
                )}

                {/* Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(photo.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.95)',
                    border: 'none',
                    boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    opacity: 0,
                    transition: 'opacity 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                >
                  <X style={{ width: '16px', height: '16px', color: '#64748B' }} />
                </button>

                {/* Severity Badge */}
                {photo.analysis && severityStyle && (
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: severityStyle.bg,
                    color: severityStyle.color,
                    boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.2)',
                    textTransform: 'capitalize'
                  }}>
                    {photo.analysis.severity}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {photos.length > 0 && completedCount > 0 && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <Button
            onClick={() => {
              photos.forEach(p => URL.revokeObjectURL(p.preview));
              setPhotos([]);
            }}
            style={{
              background: 'white',
              color: '#64748B',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '12px 20px',
              fontWeight: '500',
              cursor: 'pointer'
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
            style={{
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 8px 24px -8px rgba(59, 130, 246, 0.5)'
            }}
          >
            Continue with {completedCount} Photo{completedCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default InspectionUploader;
