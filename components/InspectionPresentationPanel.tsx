/**
 * InspectionPresentationPanel - Complete workflow integration
 * Combines all inspection presentation components into one panel
 *
 * Usage Example:
 * import InspectionPresentationPanel from './components/InspectionPresentationPanel';
 * <InspectionPresentationPanel />
 */

import React, { useState } from 'react';
import { Presentation, Camera, FileText, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
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

export const InspectionPresentationPanel: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [isPresenting, setIsPresenting] = useState(false);

  // Handle photos analyzed
  const handlePhotosAnalyzed = (analyzedPhotos: UploadedPhoto[]) => {
    setPhotos(analyzedPhotos);
    setCurrentStep('review');
  };

  // Handle presentation generated
  const handlePresentationGenerated = (generatedSlides: PresentationSlide[]) => {
    setSlides(generatedSlides);
    setIsPresenting(true);
  };

  // Handle presentation preview
  const handlePresentationPreview = (generatedSlides: PresentationSlide[]) => {
    setSlides(generatedSlides);
    setIsPresenting(true);
  };

  // Reset workflow
  const resetWorkflow = () => {
    setCurrentStep('upload');
    setPhotos([]);
    setSlides([]);
    setIsPresenting(false);
  };

  // Workflow steps
  const steps = [
    { id: 'upload', label: 'Upload Photos', icon: Camera, description: 'Upload and analyze inspection photos' },
    { id: 'review', label: 'Review Findings', icon: FileText, description: 'Review AI analysis results' },
    { id: 'customize', label: 'Customize', icon: Presentation, description: 'Build and customize presentation' },
    { id: 'present', label: 'Present', icon: Play, description: 'Full-screen presentation mode' }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Presentation className="w-8 h-8 text-[#e94560]" />
                Inspection Presentation Builder
              </CardTitle>
              <CardDescription>
                Upload roof inspection photos, get AI analysis, and create professional presentations
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Progress Steps */}
          <Card className="p-2">
            <div className="grid grid-cols-4 gap-2">
              {steps.map((step, idx) => {
                const StepIcon = step.icon;
                const isActive = currentStep === step.id;
                const isCompleted = idx < currentStepIndex;
                const isLocked = !isCompleted && !isActive;

                return (
                  <button
                    key={step.id}
                    onClick={() => {
                      if (isCompleted || isActive) {
                        setCurrentStep(step.id as WorkflowStep);
                      }
                    }}
                    disabled={isLocked}
                    className={`
                      relative p-4 rounded-xl transition-all duration-200
                      ${isActive
                        ? 'bg-[#e94560]/20 ring-2 ring-[#e94560] shadow-lg shadow-[#e94560]/20'
                        : isCompleted
                        ? 'bg-zinc-800/80 hover:bg-zinc-700/80 cursor-pointer'
                        : 'bg-zinc-900/50 opacity-40 cursor-not-allowed'
                      }
                    `}
                  >
                    {/* Step number badge */}
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                      <span className={`text-xs font-bold ${isActive ? 'text-[#e94560]' : isCompleted ? 'text-green-400' : 'text-zinc-500'}`}>
                        {idx + 1}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <div className={`
                        w-14 h-14 rounded-2xl flex items-center justify-center transition-all
                        ${isActive
                          ? 'bg-gradient-to-br from-[#e94560] to-[#ff6b88] shadow-lg'
                          : isCompleted
                          ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                          : 'bg-zinc-800 border border-zinc-700'
                        }
                      `}>
                        <StepIcon className={`w-7 h-7 ${isLocked ? 'text-zinc-500' : 'text-white'}`} />
                      </div>
                      <div className="text-center">
                        <p className={`font-semibold text-sm ${isActive ? 'text-white' : isCompleted ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          {step.label}
                        </p>
                        <p className={`text-xs mt-1 ${isActive ? 'text-zinc-400' : 'text-zinc-600'}`}>
                          {step.description}
                        </p>
                      </div>
                    </div>

                    {/* Lock indicator for locked steps */}
                    {isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-zinc-900/80 rounded-xl p-2">
                          <svg className="w-4 h-4 text-zinc-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step Content */}
          <div className="space-y-6">
            {/* Step 1: Upload */}
            {currentStep === 'upload' && (
              <div className="space-y-6">
                <InspectionUploader
                  onPhotosAnalyzed={handlePhotosAnalyzed}
                  maxPhotos={20}
                />

                {photos.length > 0 && (
                  <div className="flex justify-end">
                    <Button onClick={() => setCurrentStep('review')}>
                      Continue to Review
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Review */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Review Analysis Results</CardTitle>
                    <CardDescription>
                      Review AI-analyzed inspection photos. {photos.length} findings documented.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
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
                  </CardContent>
                </Card>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setCurrentStep('upload')}>
                    Back to Upload
                  </Button>
                  <Button onClick={() => setCurrentStep('customize')}>
                    Build Presentation
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Customize */}
            {currentStep === 'customize' && (
              <div className="space-y-6">
                <PresentationGenerator
                  photos={photos}
                  onGenerate={handlePresentationGenerated}
                  onPreview={handlePresentationPreview}
                />

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setCurrentStep('review')}>
                    Back to Review
                  </Button>
                  <Button onClick={() => setCurrentStep('present')} disabled={slides.length === 0}>
                    Start Presentation
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Present */}
            {currentStep === 'present' && !isPresenting && (
              <Card>
                <CardHeader>
                  <CardTitle>Ready to Present</CardTitle>
                  <CardDescription>
                    Your presentation is ready with {slides.length} slides. Click below to start.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                      <p className="text-3xl font-bold text-white">{slides.length}</p>
                      <p className="text-sm text-white/60">Total Slides</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                      <p className="text-3xl font-bold text-white">{photos.length}</p>
                      <p className="text-sm text-white/60">Findings</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                      <p className="text-3xl font-bold text-[#e94560]">
                        {photos.filter(p => p.analysis?.insuranceRelevant).length}
                      </p>
                      <p className="text-sm text-white/60">Insurance Claims</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                      <p className="text-3xl font-bold text-red-500">
                        {photos.filter(p => p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe').length}
                      </p>
                      <p className="text-sm text-white/60">Critical/Severe</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <Button variant="outline" onClick={() => setCurrentStep('customize')}>
                      Back to Customize
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={resetWorkflow}>
                        Start Over
                      </Button>
                      <Button onClick={() => setIsPresenting(true)} size="lg">
                        <Play className="w-5 h-5 mr-2" />
                        Start Presentation
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
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
