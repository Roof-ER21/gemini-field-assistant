/**
 * InspectionPresenter - Full-screen presentation viewer
 * Keyboard navigation, slide counter, fullscreen support, Susan AI overlay
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize,
  Minimize,
  Download,
  Share2,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { Button } from './ui/button';
import SusanChatWidget from './SusanChatWidget';
import type { PhotoAnalysis } from './InspectionUploader';

interface PresentationSlide {
  id: string;
  type: 'title' | 'photo' | 'summary' | 'recommendations';
  photo?: string;
  analysis?: PhotoAnalysis;
  title?: string;
  content?: string;
  order: number;
}

interface InspectionPresenterProps {
  slides: PresentationSlide[];
  onClose: () => void;
  propertyAddress?: string;
  inspectorName?: string;
}

export const InspectionPresenter: React.FC<InspectionPresenterProps> = ({
  slides,
  onClose,
  propertyAddress,
  inspectorName
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          nextSlide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          previousSlide();
          break;
        case 'Escape':
          if (isFullscreen) {
            exitFullscreen();
          } else {
            onClose();
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Home':
          e.preventDefault();
          setCurrentSlide(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentSlide(slides.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, slides.length, isFullscreen]);

  // Auto-hide controls
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const resetTimeout = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    const handleMouseMove = () => resetTimeout();

    window.addEventListener('mousemove', handleMouseMove);
    resetTimeout();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  // Navigation
  const nextSlide = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1));
  }, [slides.length]);

  const previousSlide = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Download presentation
  const handleDownload = () => {
    // TODO: Implement PDF generation
    alert('PDF download coming soon!');
  };

  // Share presentation
  const handleShare = () => {
    // TODO: Implement share functionality
    alert('Share functionality coming soon!');
  };

  const slide = slides[currentSlide];

  // Render slide content based on type
  const renderSlideContent = () => {
    if (!slide) return null;

    switch (slide.type) {
      case 'title':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <h1 className="text-6xl font-bold text-white mb-8 animate-fade-in">
              {slide.title}
            </h1>
            <div className="text-2xl text-white/80 space-y-4 max-w-2xl">
              {slide.content?.split('\n').map((line, idx) => (
                <p key={idx} className="animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-12 px-6 py-3 bg-gradient-to-r from-[#e94560] to-[#ff6b88] rounded-full">
              <p className="text-white font-semibold">
                {slides.length - 1} Findings Documented
              </p>
            </div>
          </div>
        );

      case 'photo':
        return (
          <div className="grid grid-cols-2 gap-8 h-full p-8">
            {/* Photo */}
            <div className="flex items-center justify-center">
              <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
                <img
                  src={slide.photo}
                  alt={slide.title}
                  className="w-full h-full object-contain bg-black"
                />
                {slide.analysis?.insuranceRelevant && (
                  <div className="absolute top-4 right-4 px-4 py-2 bg-[#e94560] rounded-full flex items-center gap-2">
                    <Shield className="w-5 h-5 text-white" />
                    <span className="text-sm font-bold text-white">INSURANCE CLAIM</span>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis */}
            <div className="flex flex-col justify-center space-y-6">
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <AlertTriangle className={`w-8 h-8 ${
                    slide.analysis?.severity === 'critical' ? 'text-red-500' :
                    slide.analysis?.severity === 'severe' ? 'text-orange-500' :
                    slide.analysis?.severity === 'moderate' ? 'text-yellow-500' :
                    'text-green-500'
                  }`} />
                  <div className={`px-4 py-2 rounded-full text-lg font-bold text-white ${
                    slide.analysis?.severity === 'critical' ? 'bg-red-500' :
                    slide.analysis?.severity === 'severe' ? 'bg-orange-500' :
                    slide.analysis?.severity === 'moderate' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}>
                    {slide.analysis?.severity?.toUpperCase()}
                  </div>
                </div>
                <h2 className="text-4xl font-bold text-white mb-4">{slide.title}</h2>
                <p className="text-xl text-white/80 mb-2">Location: {slide.analysis?.location}</p>
                <p className="text-lg text-white/70 leading-relaxed">{slide.analysis?.description}</p>
              </div>

              {slide.analysis?.estimatedRepairCost && (
                <div className="p-4 bg-gradient-to-r from-green-500/20 to-transparent rounded-xl border border-green-500/30">
                  <p className="text-sm text-white/60 mb-1">Estimated Repair Cost</p>
                  <p className="text-3xl font-bold text-green-400">{slide.analysis.estimatedRepairCost}</p>
                </div>
              )}

              {slide.analysis?.recommendations && slide.analysis.recommendations.length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold text-white mb-3">Recommendations:</h3>
                  <ul className="space-y-2">
                    {slide.analysis.recommendations.slice(0, 3).map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-white/80">
                        <span className="text-[#e94560] font-bold text-lg flex-shrink-0">{idx + 1}.</span>
                        <span className="text-base">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );

      case 'summary':
        return (
          <div className="flex flex-col items-center justify-center h-full px-8">
            <h2 className="text-5xl font-bold text-white mb-12">{slide.title}</h2>
            <div className="w-full max-w-3xl">
              <div className="text-2xl text-white/80 whitespace-pre-line leading-relaxed">
                {slide.content?.split('\n').map((line, idx) => (
                  <div key={idx} className="mb-4 animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                    {line.startsWith('•') ? (
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-[#e94560]" />
                        <span>{line.substring(1).trim()}</span>
                      </div>
                    ) : (
                      <p className={line.includes(':') ? 'font-bold text-white' : ''}>{line}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'recommendations':
        return (
          <div className="flex flex-col h-full p-8">
            <h2 className="text-5xl font-bold text-white mb-12 text-center">{slide.title}</h2>
            <div className="grid grid-cols-2 gap-6 flex-grow">
              {slide.content?.split('\n').filter(line => line.trim()).map((rec, idx) => (
                <div
                  key={idx}
                  className="p-6 bg-gradient-to-br from-white/10 to-white/5 rounded-xl border border-white/20 shadow-lg animate-fade-in"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#e94560] to-[#ff6b88] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                      {idx + 1}
                    </div>
                    <p className="text-lg text-white/90 leading-relaxed flex-grow">{rec}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black via-zinc-900 to-black z-50 flex flex-col">
      {/* Controls Overlay */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
            <div className="text-white">
              <h3 className="font-semibold">{propertyAddress || 'Inspection Presentation'}</h3>
              <p className="text-xs text-white/60">{inspectorName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleShare}>
              <Share2 className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload}>
              <Download className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Slide Content */}
      <div className="flex-grow relative overflow-hidden">
        {renderSlideContent()}
      </div>

      {/* Navigation Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-10 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between p-4 bg-gradient-to-t from-black/80 to-transparent backdrop-blur-sm">
          <Button
            variant="ghost"
            onClick={previousSlide}
            disabled={currentSlide === 0}
            className="text-white"
          >
            <ChevronLeft className="w-5 h-5 mr-2" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentSlide
                    ? 'bg-[#e94560] w-8'
                    : 'bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-white/80 text-sm">
              {currentSlide + 1} / {slides.length}
            </span>
            <Button
              variant="ghost"
              onClick={nextSlide}
              disabled={currentSlide === slides.length - 1}
              className="text-white"
            >
              Next
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* Susan AI Chat Widget */}
      <SusanChatWidget
        currentSlide={slide}
        slideNumber={currentSlide + 1}
        totalSlides={slides.length}
      />

      {/* Keyboard Shortcuts Help */}
      <div
        className={`absolute bottom-20 left-4 text-xs text-white/40 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p>← → Arrow keys • F Fullscreen • Esc Exit</p>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default InspectionPresenter;
