/**
 * InspectionPresentationPanel - Premium SaaS Inspection Builder
 * A refined, professional interface for roof inspection presentations
 */

import React, { useState } from 'react';
import {
  Presentation, Camera, FileText, Play, Eye, BarChart3,
  Upload, Plus, ChevronRight, Clock, TrendingUp, Image,
  CheckCircle2, ArrowRight, Sparkles, Shield, Zap
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

// Stats Card Component
const StatCard: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
  trend?: string;
  trendUp?: boolean;
}> = ({ icon, value, label, trend, trendUp }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100 flex items-center justify-center text-rose-600">
        {icon}
      </div>
      {trend && (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
        }`}>
          {trend}
        </span>
      )}
    </div>
    <div className="mt-4">
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  </div>
);

// Step Indicator Component
const StepIndicator: React.FC<{
  step: number;
  label: string;
  description: string;
  icon: React.ReactNode;
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
  disabled: boolean;
}> = ({ step, label, description, icon, isActive, isCompleted, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      relative flex items-center gap-4 p-4 rounded-xl transition-all duration-200 w-full text-left
      ${isActive
        ? 'bg-rose-50 border-2 border-rose-200'
        : isCompleted
        ? 'bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 cursor-pointer'
        : 'bg-slate-50 border border-slate-100 opacity-60 cursor-not-allowed'
      }
    `}
  >
    {/* Step Number */}
    <div className={`
      w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-semibold text-sm
      ${isActive
        ? 'bg-rose-600 text-white shadow-lg shadow-rose-200'
        : isCompleted
        ? 'bg-emerald-500 text-white'
        : 'bg-slate-200 text-slate-500'
      }
    `}>
      {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : step}
    </div>

    {/* Content */}
    <div className="flex-1 min-w-0">
      <p className={`font-semibold text-sm ${isActive ? 'text-rose-900' : isCompleted ? 'text-emerald-900' : 'text-slate-600'}`}>
        {label}
      </p>
      <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-rose-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}>
        {description}
      </p>
    </div>

    {/* Arrow */}
    {(isActive || isCompleted) && (
      <ChevronRight className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-rose-400' : 'text-emerald-400'}`} />
    )}
  </button>
);

// Feature Badge Component
const FeatureBadge: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
    <span className="text-rose-600">{icon}</span>
    <span className="text-xs font-medium text-slate-700">{label}</span>
  </div>
);

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
    { id: 'upload', label: 'Upload Photos', icon: <Camera className="w-5 h-5" />, description: 'Add inspection images' },
    { id: 'review', label: 'Review Findings', icon: <FileText className="w-5 h-5" />, description: 'AI analysis results' },
    { id: 'customize', label: 'Build Presentation', icon: <Presentation className="w-5 h-5" />, description: 'Customize slides' },
    { id: 'present', label: 'Present & Share', icon: <Play className="w-5 h-5" />, description: 'Go live' }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);
  const criticalCount = photos.filter(p => p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe').length;
  const insuranceCount = photos.filter(p => p.analysis?.insuranceRelevant).length;

  return (
    <>
      {/* Main Container - Light Theme */}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-200">
                  <Presentation className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    Inspection Presentations
                  </h1>
                  <p className="text-sm text-slate-500">Create professional roof inspection reports</p>
                </div>
              </div>
              <Button
                onClick={resetWorkflow}
                className="bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200 rounded-xl px-5"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Inspection
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<Eye className="w-5 h-5" />}
              value={photos.length}
              label="Photos Uploaded"
            />
            <StatCard
              icon={<Sparkles className="w-5 h-5" />}
              value={photos.filter(p => p.status === 'complete').length}
              label="AI Analyzed"
            />
            <StatCard
              icon={<Shield className="w-5 h-5" />}
              value={insuranceCount}
              label="Insurance Claims"
              trend={insuranceCount > 0 ? `${insuranceCount} flagged` : undefined}
              trendUp={true}
            />
            <StatCard
              icon={<Zap className="w-5 h-5" />}
              value={criticalCount}
              label="Critical Issues"
              trend={criticalCount > 0 ? 'Needs attention' : undefined}
              trendUp={false}
            />
          </div>

          {/* Main Layout - Sidebar + Content */}
          <div className="flex gap-8">
            {/* Sidebar - Workflow Steps */}
            <div className="w-72 flex-shrink-0">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 sticky top-28">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">
                  Workflow Steps
                </h3>
                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <StepIndicator
                      key={step.id}
                      step={idx + 1}
                      label={step.label}
                      description={step.description}
                      icon={step.icon}
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
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">
                      Quick Stats
                    </h3>
                    <div className="space-y-3 px-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 flex items-center gap-2">
                          <Image className="w-4 h-4 text-rose-500" />
                          Total Photos
                        </span>
                        <span className="font-semibold text-slate-900">{photos.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-rose-500" />
                          Slides
                        </span>
                        <span className="font-semibold text-slate-900">{slides.length || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-rose-500" />
                          Est. Time
                        </span>
                        <span className="font-semibold text-slate-900">{slides.length ? `${Math.max(1, Math.ceil(slides.length * 1.5))}m` : '—'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              {/* Step 1: Upload */}
              {currentStep === 'upload' && (
                <div className="space-y-6">
                  {/* Upload Card */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">Upload Inspection Photos</h2>
                          <p className="text-sm text-slate-500 mt-1">Add roof photos for AI-powered damage analysis</p>
                        </div>
                        <div className="flex gap-2">
                          <FeatureBadge icon={<Sparkles className="w-3.5 h-3.5" />} label="AI Analysis" />
                          <FeatureBadge icon={<Shield className="w-3.5 h-3.5" />} label="Insurance Ready" />
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <InspectionUploader
                        onPhotosAnalyzed={handlePhotosAnalyzed}
                        maxPhotos={20}
                      />
                    </div>
                  </div>

                  {photos.length > 0 && (
                    <div className="flex justify-end">
                      <Button
                        onClick={() => setCurrentStep('review')}
                        className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-6"
                      >
                        Continue to Review
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Review */}
              {currentStep === 'review' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">Review AI Analysis</h2>
                          <p className="text-sm text-slate-500 mt-1">{photos.length} findings documented and analyzed</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-2xl font-bold text-rose-600">{insuranceCount}</p>
                            <p className="text-xs text-slate-500">Insurance Claims</p>
                          </div>
                          <div className="w-px h-10 bg-slate-200" />
                          <div className="text-right">
                            <p className="text-2xl font-bold text-amber-600">{criticalCount}</p>
                            <p className="text-xs text-slate-500">Critical Issues</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
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

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep('upload')}
                      className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Back to Upload
                    </Button>
                    <Button
                      onClick={() => setCurrentStep('customize')}
                      className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-6"
                    >
                      Build Presentation
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Customize */}
              {currentStep === 'customize' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <h2 className="text-lg font-bold text-slate-900">Build Your Presentation</h2>
                      <p className="text-sm text-slate-500 mt-1">Customize and arrange your presentation slides</p>
                    </div>
                    <div className="p-6">
                      <PresentationGenerator
                        photos={photos}
                        onGenerate={handlePresentationGenerated}
                        onPreview={handlePresentationPreview}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep('review')}
                      className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Back to Review
                    </Button>
                    <Button
                      onClick={() => setCurrentStep('present')}
                      disabled={slides.length === 0}
                      className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-6 disabled:opacity-50"
                    >
                      Continue to Present
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Present */}
              {currentStep === 'present' && !isPresenting && (
                <div className="space-y-6">
                  {/* Ready to Present Card */}
                  <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-8 text-white shadow-xl shadow-rose-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-2xl font-bold">Ready to Present</h2>
                        <p className="text-rose-100 mt-2">Your presentation is ready with {slides.length} slides</p>
                      </div>
                      <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                        <Play className="w-8 h-8 text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mt-8">
                      <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                        <p className="text-3xl font-bold">{slides.length}</p>
                        <p className="text-sm text-rose-200 mt-1">Total Slides</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                        <p className="text-3xl font-bold">{photos.length}</p>
                        <p className="text-sm text-rose-200 mt-1">Findings</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                        <p className="text-3xl font-bold">{insuranceCount}</p>
                        <p className="text-sm text-rose-200 mt-1">Insurance Claims</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                        <p className="text-3xl font-bold">{Math.max(1, Math.ceil(slides.length * 1.5))}m</p>
                        <p className="text-sm text-rose-200 mt-1">Est. Duration</p>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-8">
                      <Button
                        onClick={() => setIsPresenting(true)}
                        size="lg"
                        className="bg-white text-rose-600 hover:bg-rose-50 rounded-xl px-8 font-semibold"
                      >
                        <Play className="w-5 h-5 mr-2" />
                        Start Presentation
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setCurrentStep('customize')}
                        className="border-white/30 text-white hover:bg-white/10 rounded-xl"
                      >
                        Edit Slides
                      </Button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <button className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-colors text-left">
                        <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                          <Eye className="w-5 h-5 text-rose-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Preview</p>
                          <p className="text-xs text-slate-500">View before sharing</p>
                        </div>
                      </button>
                      <button className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-colors text-left">
                        <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                          <BarChart3 className="w-5 h-5 text-rose-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Analytics</p>
                          <p className="text-xs text-slate-500">View engagement</p>
                        </div>
                      </button>
                      <button className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-colors text-left">
                        <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-rose-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">Share Link</p>
                          <p className="text-xs text-slate-500">Send to homeowner</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <Button
                      variant="outline"
                      onClick={resetWorkflow}
                      className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
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
