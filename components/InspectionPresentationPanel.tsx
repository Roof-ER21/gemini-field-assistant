/**
 * InspectionPresentationPanel - Premium SaaS Inspection Builder
 * Beautiful, colorful professional interface with forced light mode
 */

import React, { useState } from 'react';
import {
  Presentation, Camera, FileText, Play, Eye, BarChart3,
  Upload, Plus, ChevronRight, Clock, TrendingUp, Image,
  CheckCircle2, ArrowRight, Sparkles, Shield, Zap, AlertTriangle
} from 'lucide-react';
import { Button } from './ui/button';
import InspectionUploader from './InspectionUploader';
import PhotoAnalysisCard from './PhotoAnalysisCard';
import PresentationGenerator from './PresentationGenerator';
import InspectionPresenter from './InspectionPresenter';
import type { PhotoAnalysis } from './InspectionUploader';

type WorkflowStep = 'upload' | 'review' | 'customize' | 'present';

interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'analyzing' | 'complete' | 'error';
  analysis?: PhotoAnalysis;
  error?: string;
}

interface PresentationSlide {
  id: string;
  type: 'title' | 'photo' | 'summary' | 'recommendations';
  photo?: string;
  analysis?: PhotoAnalysis;
  title?: string;
  content?: string;
  order: number;
}

// Colorful Stats Card with forced light styling
const StatCard: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
  trend?: string;
}> = ({ icon, value, label, color, trend }) => {
  const colorStyles = {
    blue: {
      bg: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      shadow: '0 10px 40px -10px rgba(59, 130, 246, 0.5)'
    },
    purple: {
      bg: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      shadow: '0 10px 40px -10px rgba(139, 92, 246, 0.5)'
    },
    green: {
      bg: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      shadow: '0 10px 40px -10px rgba(16, 185, 129, 0.5)'
    },
    orange: {
      bg: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      shadow: '0 10px 40px -10px rgba(249, 115, 22, 0.5)'
    }
  };

  const style = colorStyles[color];

  return (
    <div
      style={{
        background: style.bg,
        boxShadow: style.shadow,
        borderRadius: '16px',
        padding: '20px',
        color: 'white'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: style.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {icon}
        </div>
        {trend && (
          <span style={{
            fontSize: '12px',
            fontWeight: '500',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.2)'
          }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ marginTop: '16px' }}>
        <p style={{ fontSize: '32px', fontWeight: '700', letterSpacing: '-0.02em' }}>{value}</p>
        <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>{label}</p>
      </div>
    </div>
  );
};

// Step Indicator with explicit colors
const StepIndicator: React.FC<{
  step: number;
  label: string;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
  disabled: boolean;
}> = ({ step, label, description, isActive, isCompleted, onClick, disabled }) => {
  let bgColor = '#F8FAFC'; // slate-50
  let borderColor = '#E2E8F0'; // slate-200
  let numberBg = '#CBD5E1'; // slate-300
  let numberColor = '#64748B'; // slate-500
  let textColor = '#64748B'; // slate-500
  let descColor = '#94A3B8'; // slate-400

  if (isActive) {
    bgColor = '#EFF6FF'; // blue-50
    borderColor = '#3B82F6'; // blue-500
    numberBg = '#3B82F6'; // blue-500
    numberColor = '#FFFFFF';
    textColor = '#1E40AF'; // blue-800
    descColor = '#3B82F6'; // blue-500
  } else if (isCompleted) {
    bgColor = '#F0FDF4'; // green-50
    borderColor = '#22C55E'; // green-500
    numberBg = '#22C55E'; // green-500
    numberColor = '#FFFFFF';
    textColor = '#166534'; // green-800
    descColor = '#22C55E'; // green-500
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px',
        borderRadius: '12px',
        background: bgColor,
        border: `2px solid ${borderColor}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
        textAlign: 'left'
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: numberBg,
          color: numberColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '600',
          fontSize: '14px',
          flexShrink: 0
        }}
      >
        {isCompleted ? <CheckCircle2 style={{ width: '20px', height: '20px' }} /> : step}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: '600', fontSize: '14px', color: textColor, margin: 0 }}>{label}</p>
        <p style={{ fontSize: '12px', color: descColor, margin: '2px 0 0 0' }}>{description}</p>
      </div>
      {(isActive || isCompleted) && (
        <ChevronRight style={{ width: '20px', height: '20px', color: borderColor, flexShrink: 0 }} />
      )}
    </button>
  );
};

export const InspectionPresentationPanel: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [isPresenting, setIsPresenting] = useState(false);

  const handlePhotosAnalyzed = (analyzedPhotos: UploadedPhoto[]) => {
    setPhotos(analyzedPhotos);
    setCurrentStep('review');
  };

  const handlePresentationGenerated = (generatedSlides: PresentationSlide[]) => {
    setSlides(generatedSlides);
    setIsPresenting(true);
  };

  const handlePresentationPreview = (generatedSlides: PresentationSlide[]) => {
    setSlides(generatedSlides);
    setIsPresenting(true);
  };

  const resetWorkflow = () => {
    setCurrentStep('upload');
    setPhotos([]);
    setSlides([]);
    setIsPresenting(false);
  };

  const steps = [
    { id: 'upload', label: 'Upload Photos', description: 'Add inspection images' },
    { id: 'review', label: 'Review Findings', description: 'AI analysis results' },
    { id: 'customize', label: 'Build Presentation', description: 'Customize slides' },
    { id: 'present', label: 'Present & Share', description: 'Go live' }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);
  const criticalCount = photos.filter(p => p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe').length;
  const insuranceCount = photos.filter(p => p.analysis?.insuranceRelevant).length;

  return (
    <>
      {/* FORCE LIGHT MODE - Override any dark theme */}
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 50%, #F1F5F9 100%)',
          color: '#1E293B'
        }}
      >
        {/* Header */}
        <div
          style={{
            borderBottom: '1px solid #E2E8F0',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            position: 'sticky',
            top: 0,
            zIndex: 40
          }}
        >
          <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 24px -8px rgba(59, 130, 246, 0.5)'
                  }}
                >
                  <Presentation style={{ width: '24px', height: '24px', color: 'white' }} />
                </div>
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                    Inspection Presentations
                  </h1>
                  <p style={{ fontSize: '14px', color: '#64748B', margin: '2px 0 0 0' }}>
                    Create professional roof inspection reports
                  </p>
                </div>
              </div>
              <Button
                onClick={resetWorkflow}
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 20px',
                  fontWeight: '600',
                  boxShadow: '0 8px 24px -8px rgba(59, 130, 246, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <Plus style={{ width: '18px', height: '18px' }} />
                New Inspection
              </Button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>
          {/* Stats Row - Colorful Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
            <StatCard
              icon={<Camera style={{ width: '24px', height: '24px' }} />}
              value={photos.length}
              label="Photos Uploaded"
              color="blue"
            />
            <StatCard
              icon={<Sparkles style={{ width: '24px', height: '24px' }} />}
              value={photos.filter(p => p.status === 'complete').length}
              label="AI Analyzed"
              color="purple"
            />
            <StatCard
              icon={<Shield style={{ width: '24px', height: '24px' }} />}
              value={insuranceCount}
              label="Insurance Claims"
              color="green"
              trend={insuranceCount > 0 ? `${insuranceCount} flagged` : undefined}
            />
            <StatCard
              icon={<AlertTriangle style={{ width: '24px', height: '24px' }} />}
              value={criticalCount}
              label="Critical Issues"
              color="orange"
              trend={criticalCount > 0 ? 'Urgent' : undefined}
            />
          </div>

          {/* Main Layout */}
          <div style={{ display: 'flex', gap: '32px' }}>
            {/* Sidebar */}
            <div style={{ width: '280px', flexShrink: 0 }}>
              <div
                style={{
                  background: 'white',
                  borderRadius: '20px',
                  padding: '20px',
                  boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08)',
                  border: '1px solid #E2E8F0',
                  position: 'sticky',
                  top: '100px'
                }}
              >
                <h3 style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  margin: '0 0 16px 8px'
                }}>
                  Workflow Steps
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {steps.map((step, idx) => (
                    <StepIndicator
                      key={step.id}
                      step={idx + 1}
                      label={step.label}
                      description={step.description}
                      isActive={currentStep === step.id}
                      isCompleted={idx < currentStepIndex}
                      onClick={() => {
                        if (idx <= currentStepIndex) {
                          setCurrentStep(step.id as WorkflowStep);
                        }
                      }}
                      disabled={idx > currentStepIndex}
                    />
                  ))}
                </div>

                {/* Quick Stats */}
                {photos.length > 0 && (
                  <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #E2E8F0' }}>
                    <h3 style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: '#94A3B8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      margin: '0 0 16px 8px'
                    }}>
                      Quick Stats
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#64748B' }}>
                          <Image style={{ width: '16px', height: '16px', color: '#3B82F6' }} />
                          Total Photos
                        </span>
                        <span style={{ fontWeight: '600', color: '#0F172A' }}>{photos.length}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#64748B' }}>
                          <BarChart3 style={{ width: '16px', height: '16px', color: '#8B5CF6' }} />
                          Slides
                        </span>
                        <span style={{ fontWeight: '600', color: '#0F172A' }}>{slides.length || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#64748B' }}>
                          <Clock style={{ width: '16px', height: '16px', color: '#10B981' }} />
                          Est. Time
                        </span>
                        <span style={{ fontWeight: '600', color: '#0F172A' }}>{slides.length ? `${Math.max(1, Math.ceil(slides.length * 1.5))}m` : '—'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Step 1: Upload */}
              {currentStep === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div
                    style={{
                      background: 'white',
                      borderRadius: '20px',
                      boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #E2E8F0',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', margin: 0 }}>
                            Upload Inspection Photos
                          </h2>
                          <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>
                            Add roof photos for AI-powered damage analysis
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            background: '#EFF6FF',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#3B82F6'
                          }}>
                            <Sparkles style={{ width: '14px', height: '14px' }} />
                            AI Analysis
                          </span>
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            background: '#F0FDF4',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#22C55E'
                          }}>
                            <Shield style={{ width: '14px', height: '14px' }} />
                            Insurance Ready
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '24px' }}>
                      <InspectionUploader
                        onPhotosAnalyzed={handlePhotosAnalyzed}
                        maxPhotos={20}
                      />
                    </div>
                  </div>

                  {photos.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        onClick={() => setCurrentStep('review')}
                        style={{
                          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '12px 24px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        Continue to Review
                        <ArrowRight style={{ width: '18px', height: '18px' }} />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Review */}
              {currentStep === 'review' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div
                    style={{
                      background: 'white',
                      borderRadius: '20px',
                      boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #E2E8F0',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', margin: 0 }}>
                            Review AI Analysis
                          </h2>
                          <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>
                            {photos.length} findings documented and analyzed
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '24px', fontWeight: '700', color: '#22C55E', margin: 0 }}>{insuranceCount}</p>
                            <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>Insurance Claims</p>
                          </div>
                          <div style={{ width: '1px', height: '40px', background: '#E2E8F0' }} />
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '24px', fontWeight: '700', color: '#F97316', margin: 0 }}>{criticalCount}</p>
                            <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>Critical Issues</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {photos.map((photo, idx) => (
                        photo.analysis && (
                          <PhotoAnalysisCard
                            key={photo.id}
                            photo={photo.preview}
                            analysis={photo.analysis}
                            photoNumber={idx + 1}
                          />
                        )
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Button
                      onClick={() => setCurrentStep('upload')}
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
                      Back to Upload
                    </Button>
                    <Button
                      onClick={() => setCurrentStep('customize')}
                      style={{
                        background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Build Presentation
                      <ArrowRight style={{ width: '18px', height: '18px' }} />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Customize */}
              {currentStep === 'customize' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div
                    style={{
                      background: 'white',
                      borderRadius: '20px',
                      boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #E2E8F0',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', margin: 0 }}>
                        Build Your Presentation
                      </h2>
                      <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>
                        Customize and arrange your presentation slides
                      </p>
                    </div>
                    <div style={{ padding: '24px' }}>
                      <PresentationGenerator
                        photos={photos}
                        onGenerate={handlePresentationGenerated}
                        onPreview={handlePresentationPreview}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Button
                      onClick={() => setCurrentStep('review')}
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
                      Back to Review
                    </Button>
                    <Button
                      onClick={() => setCurrentStep('present')}
                      disabled={slides.length === 0}
                      style={{
                        background: slides.length === 0 ? '#E2E8F0' : 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                        color: slides.length === 0 ? '#94A3B8' : 'white',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: slides.length === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Continue to Present
                      <ArrowRight style={{ width: '18px', height: '18px' }} />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Present */}
              {currentStep === 'present' && !isPresenting && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Hero Card */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 50%, #7C3AED 100%)',
                      borderRadius: '24px',
                      padding: '40px',
                      color: 'white',
                      boxShadow: '0 20px 60px -20px rgba(59, 130, 246, 0.5)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <h2 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Ready to Present</h2>
                        <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: '8px' }}>
                          Your presentation is ready with {slides.length} slides
                        </p>
                      </div>
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '16px',
                          background: 'rgba(255,255,255,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Play style={{ width: '32px', height: '32px' }} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '32px' }}>
                      {[
                        { value: slides.length, label: 'Total Slides' },
                        { value: photos.length, label: 'Findings' },
                        { value: insuranceCount, label: 'Insurance Claims' },
                        { value: `${Math.max(1, Math.ceil(slides.length * 1.5))}m`, label: 'Est. Duration' }
                      ].map((stat, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '16px',
                            padding: '20px'
                          }}
                        >
                          <p style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>{stat.value}</p>
                          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                      <Button
                        onClick={() => setIsPresenting(true)}
                        style={{
                          background: 'white',
                          color: '#3B82F6',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '14px 28px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          fontSize: '15px'
                        }}
                      >
                        <Play style={{ width: '20px', height: '20px' }} />
                        Start Presentation
                      </Button>
                      <Button
                        onClick={() => setCurrentStep('customize')}
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          color: 'white',
                          border: '1px solid rgba(255,255,255,0.3)',
                          borderRadius: '12px',
                          padding: '14px 20px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        Edit Slides
                      </Button>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div
                    style={{
                      background: 'white',
                      borderRadius: '20px',
                      padding: '24px',
                      boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #E2E8F0'
                    }}
                  >
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0F172A', margin: '0 0 16px 0' }}>
                      Quick Actions
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      {[
                        { icon: <Eye style={{ width: '20px', height: '20px' }} />, label: 'Preview', desc: 'View before sharing', color: '#3B82F6', bg: '#EFF6FF' },
                        { icon: <BarChart3 style={{ width: '20px', height: '20px' }} />, label: 'Analytics', desc: 'View engagement', color: '#8B5CF6', bg: '#F5F3FF' },
                        { icon: <TrendingUp style={{ width: '20px', height: '20px' }} />, label: 'Share Link', desc: 'Send to homeowner', color: '#22C55E', bg: '#F0FDF4' }
                      ].map((action, idx) => (
                        <button
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '16px',
                            borderRadius: '14px',
                            border: '1px solid #E2E8F0',
                            background: 'white',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '12px',
                              background: action.bg,
                              color: action.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {action.icon}
                          </div>
                          <div>
                            <p style={{ fontWeight: '600', color: '#0F172A', margin: 0, fontSize: '14px' }}>{action.label}</p>
                            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>{action.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <Button
                      onClick={resetWorkflow}
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
                      Start New Inspection
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Presentation Mode */}
      {isPresenting && slides.length > 0 && (
        <InspectionPresenter
          slides={slides}
          onClose={() => setIsPresenting(false)}
          propertyAddress="Sample Property Address"
          inspectorName="Inspector Name"
        />
      )}
    </>
  );
};

export default InspectionPresentationPanel;
