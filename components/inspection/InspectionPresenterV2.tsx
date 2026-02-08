/**
 * InspectionPresenterV2 - Full-Screen Presentation with Susan AI Sidebar
 * Modern, clean presenter with real-time AI assistance
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, X, Share2, Download, Maximize2, Minimize2,
  Play, Pause, Camera, Shield, AlertTriangle, User, CheckCircle2,
  FileText, Phone, Mail, MessageCircle
} from 'lucide-react';
import { SusanAISidebar } from './SusanAISidebar';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface PhotoAnalysis {
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  location: string;
  description: string;
  recommendations: string[];
  insuranceRelevant: boolean;
  estimatedRepairCost?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

interface PresentationSlide {
  id: string;
  type: 'cover' | 'rep_profile' | 'photo' | 'summary' | 'recommendations' | 'cta';
  title: string;
  content?: string;
  photo?: string;
  photoBase64?: string;
  analysis?: PhotoAnalysis;
  order: number;
}

interface UserProfile {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  photoUrl?: string;
  credentials?: string[];
}

interface InspectionPresenterV2Props {
  slides: PresentationSlide[];
  jobId?: string;
  propertyAddress?: string;
  homeownerName?: string;
  userProfile?: UserProfile;
  onClose?: () => void;
  onShare?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const InspectionPresenterV2: React.FC<InspectionPresenterV2Props> = ({
  slides,
  jobId,
  propertyAddress,
  homeownerName,
  userProfile,
  onClose,
  onShare
}) => {
  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const currentSlide = slides[currentIndex];
  const progress = ((currentIndex + 1) / slides.length) * 100;

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentIndex(index);
    }
  }, [slides.length]);

  const nextSlide = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, slides.length]);

  const prevSlide = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'Space':
          e.preventDefault();
          nextSlide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevSlide();
          break;
        case 'Escape':
          if (isFullscreen) {
            setIsFullscreen(false);
          } else {
            onClose?.();
          }
          break;
        case 'f':
          setIsFullscreen(prev => !prev);
          break;
        case 's':
          setShowSidebar(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide, isFullscreen, onClose]);

  // Auto-play
  useEffect(() => {
    if (isAutoPlaying) {
      const interval = setInterval(() => {
        if (currentIndex < slides.length - 1) {
          nextSlide();
        } else {
          setIsAutoPlaying(false);
        }
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [isAutoPlaying, currentIndex, slides.length, nextSlide]);

  // ============================================================================
  // SLIDE RENDERERS
  // ============================================================================

  const renderSlideContent = () => {
    switch (currentSlide.type) {
      case 'cover':
        return renderCoverSlide();
      case 'rep_profile':
        return renderRepProfileSlide();
      case 'photo':
        return renderPhotoSlide();
      case 'summary':
        return renderSummarySlide();
      case 'recommendations':
        return renderRecommendationsSlide();
      case 'cta':
        return renderCtaSlide();
      default:
        return renderPhotoSlide();
    }
  };

  const renderCoverSlide = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      textAlign: 'center',
      padding: '60px'
    }}>
      <div style={{
        width: '100px',
        height: '100px',
        borderRadius: '24px',
        background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '32px',
        boxShadow: '0 20px 60px -20px rgba(59, 130, 246, 0.5)'
      }}>
        <Camera size={48} color="white" />
      </div>
      <h1 style={{
        fontSize: '42px',
        fontWeight: '700',
        color: '#0F172A',
        margin: 0,
        letterSpacing: '-0.02em'
      }}>
        {currentSlide.title}
      </h1>
      {currentSlide.content && (
        <p style={{
          fontSize: '22px',
          color: '#64748B',
          margin: '16px 0 0 0'
        }}>
          {currentSlide.content}
        </p>
      )}
      <p style={{
        fontSize: '16px',
        color: '#94A3B8',
        marginTop: '40px'
      }}>
        {new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}
      </p>
    </div>
  );

  const renderRepProfileSlide = () => {
    const profile = currentSlide.content ? JSON.parse(currentSlide.content) : userProfile;
    if (!profile) return renderCoverSlide();

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'center',
        padding: '60px'
      }}>
        <div style={{
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: profile.photoUrl
            ? `url(${profile.photoUrl}) center/cover`
            : 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '28px',
          boxShadow: '0 20px 60px -20px rgba(139, 92, 246, 0.5)',
          border: '4px solid white'
        }}>
          {!profile.photoUrl && <User size={64} color="white" />}
        </div>

        <h2 style={{
          fontSize: '36px',
          fontWeight: '700',
          color: '#0F172A',
          margin: 0
        }}>
          {profile.name}
        </h2>

        {profile.company && (
          <p style={{
            fontSize: '20px',
            color: '#3B82F6',
            margin: '8px 0 0 0',
            fontWeight: '500'
          }}>
            {profile.company}
          </p>
        )}

        {profile.credentials && profile.credentials.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '10px',
            marginTop: '20px',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            {profile.credentials.map((cred, i) => (
              <span key={i} style={{
                padding: '6px 14px',
                borderRadius: '20px',
                background: '#F0FDF4',
                color: '#166534',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CheckCircle2 size={14} />
                {cred}
              </span>
            ))}
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: '24px',
          marginTop: '32px'
        }}>
          {profile.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B' }}>
              <Phone size={18} />
              <span>{profile.phone}</span>
            </div>
          )}
          {profile.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B' }}>
              <Mail size={18} />
              <span>{profile.email}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPhotoSlide = () => {
    const analysis = currentSlide.analysis;
    const photoSrc = currentSlide.photoBase64 || currentSlide.photo;

    return (
      <div style={{
        display: 'flex',
        height: '100%',
        gap: '32px',
        padding: '32px'
      }}>
        {/* Photo */}
        <div style={{
          flex: '1.2',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{
            flex: 1,
            borderRadius: '20px',
            overflow: 'hidden',
            background: '#F1F5F9',
            position: 'relative'
          }}>
            {photoSrc && (
              <img
                src={photoSrc}
                alt={currentSlide.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
              />
            )}

            {/* Severity Badge */}
            {analysis?.severity && (
              <div style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                textTransform: 'capitalize',
                background: getSeverityColor(analysis.severity).bg,
                color: 'white',
                boxShadow: '0 4px 12px -4px rgba(0,0,0,0.3)'
              }}>
                {analysis.severity}
              </div>
            )}

            {/* Insurance Badge */}
            {analysis?.insuranceRelevant && (
              <div style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                background: '#22C55E',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px -4px rgba(0,0,0,0.3)'
              }}>
                <Shield size={16} />
                Insurance Relevant
              </div>
            )}
          </div>

          {/* Location */}
          {analysis?.location && (
            <p style={{
              fontSize: '14px',
              color: '#64748B',
              margin: 0,
              textAlign: 'center'
            }}>
              Location: {analysis.location}
            </p>
          )}
        </div>

        {/* Analysis */}
        <div style={{
          flex: '0.8',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <h2 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#0F172A',
            margin: 0
          }}>
            {currentSlide.title}
          </h2>

          {analysis?.description && (
            <p style={{
              fontSize: '16px',
              color: '#475569',
              lineHeight: '1.6',
              margin: 0
            }}>
              {analysis.description}
            </p>
          )}

          {analysis?.recommendations && analysis.recommendations.length > 0 && (
            <div style={{
              background: '#F8FAFC',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid #E2E8F0'
            }}>
              <h4 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0F172A',
                margin: '0 0 12px 0'
              }}>
                Recommendations
              </h4>
              <ul style={{
                margin: 0,
                padding: '0 0 0 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {analysis.recommendations.map((rec, i) => (
                  <li key={i} style={{ fontSize: '14px', color: '#475569' }}>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis?.estimatedRepairCost && (
            <div style={{
              background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '14px', color: '#1E40AF', fontWeight: '500' }}>
                Estimated Repair Cost
              </span>
              <span style={{ fontSize: '18px', color: '#1E40AF', fontWeight: '700' }}>
                {analysis.estimatedRepairCost}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSummarySlide = () => {
    const summary = currentSlide.content ? JSON.parse(currentSlide.content) : {};

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '60px'
      }}>
        <h2 style={{
          fontSize: '36px',
          fontWeight: '700',
          color: '#0F172A',
          margin: '0 0 40px 0'
        }}>
          {currentSlide.title}
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
          maxWidth: '800px'
        }}>
          {[
            { label: 'Total Findings', value: summary.totalFindings || 0, color: '#3B82F6', icon: <Camera size={24} /> },
            { label: 'Critical Issues', value: summary.criticalIssues || 0, color: '#F97316', icon: <AlertTriangle size={24} /> },
            { label: 'Insurance Items', value: summary.insuranceRelevant || 0, color: '#22C55E', icon: <Shield size={24} /> }
          ].map((stat, i) => (
            <div key={i} style={{
              background: 'white',
              borderRadius: '20px',
              padding: '28px',
              textAlign: 'center',
              boxShadow: '0 4px 24px -4px rgba(0,0,0,0.08)',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: `${stat.color}15`,
                color: stat.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                {stat.icon}
              </div>
              <p style={{
                fontSize: '40px',
                fontWeight: '700',
                color: stat.color,
                margin: 0
              }}>
                {stat.value}
              </p>
              <p style={{
                fontSize: '14px',
                color: '#64748B',
                margin: '8px 0 0 0'
              }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {summary.overallAssessment && (
          <p style={{
            fontSize: '18px',
            color: '#475569',
            marginTop: '40px',
            textAlign: 'center',
            maxWidth: '600px'
          }}>
            {summary.overallAssessment}
          </p>
        )}
      </div>
    );
  };

  const renderRecommendationsSlide = () => {
    const recommendations = currentSlide.content ? JSON.parse(currentSlide.content) : [];

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '60px'
      }}>
        <h2 style={{
          fontSize: '36px',
          fontWeight: '700',
          color: '#0F172A',
          margin: '0 0 40px 0'
        }}>
          {currentSlide.title}
        </h2>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '700px',
          width: '100%'
        }}>
          {recommendations.map((rec: string, i: number) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              background: 'white',
              borderRadius: '16px',
              padding: '20px 24px',
              boxShadow: '0 2px 12px -2px rgba(0,0,0,0.06)',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: '600',
                fontSize: '14px',
                flexShrink: 0
              }}>
                {i + 1}
              </div>
              <p style={{
                fontSize: '16px',
                color: '#1E293B',
                margin: 0,
                lineHeight: '1.5'
              }}>
                {rec}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCtaSlide = () => {
    const cta = currentSlide.content ? JSON.parse(currentSlide.content) : {};

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'center',
        padding: '60px',
        background: 'linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 50%, #F0FDF4 100%)'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '28px',
          boxShadow: '0 16px 48px -16px rgba(34, 197, 94, 0.5)'
        }}>
          <Shield size={40} color="white" />
        </div>

        <h2 style={{
          fontSize: '40px',
          fontWeight: '700',
          color: '#0F172A',
          margin: 0
        }}>
          {currentSlide.title}
        </h2>

        {cta.message && (
          <p style={{
            fontSize: '20px',
            color: '#475569',
            margin: '20px 0 0 0',
            maxWidth: '600px',
            lineHeight: '1.5'
          }}>
            {cta.message}
          </p>
        )}

        {cta.nextSteps && cta.nextSteps.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '16px',
            marginTop: '40px'
          }}>
            {cta.nextSteps.map((step: string, i: number) => (
              <button key={i} style={{
                padding: '14px 28px',
                borderRadius: '12px',
                border: i === 0 ? 'none' : '2px solid #22C55E',
                background: i === 0 ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'white',
                color: i === 0 ? 'white' : '#16A34A',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: i === 0 ? '0 8px 24px -8px rgba(34, 197, 94, 0.5)' : 'none'
              }}>
                {step}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: '#DC2626' };
      case 'severe': return { bg: '#EA580C' };
      case 'moderate': return { bg: '#D97706' };
      case 'minor': return { bg: '#16A34A' };
      default: return { bg: '#64748B' };
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      background: 'white',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        height: '64px',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'white'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onClose}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#F1F5F9',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#0F172A', margin: 0 }}>
              {propertyAddress || 'Roof Inspection'}
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
              Slide {currentIndex + 1} of {slides.length}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Progress Bar */}
          <div style={{
            width: '160px',
            height: '6px',
            background: '#E2E8F0',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>

          {/* Controls */}
          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: isAutoPlaying ? '#3B82F6' : '#F1F5F9',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isAutoPlaying
              ? <Pause size={18} color="white" />
              : <Play size={18} color="#64748B" />}
          </button>

          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: showSidebar ? '#3B82F6' : '#F1F5F9',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <MessageCircle size={18} color={showSidebar ? 'white' : '#64748B'} />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#F1F5F9',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isFullscreen
              ? <Minimize2 size={18} color="#64748B" />
              : <Maximize2 size={18} color="#64748B" />}
          </button>

          {onShare && (
            <button
              onClick={onShare}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'white',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              <Share2 size={16} />
              Share
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden'
      }}>
        {/* Slide Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#F8FAFC'
        }}>
          {/* Slide Content */}
          <div style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {renderSlideContent()}

            {/* Navigation Arrows */}
            <button
              onClick={prevSlide}
              disabled={currentIndex === 0}
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: currentIndex === 0 ? '#E2E8F0' : 'white',
                border: '1px solid #E2E8F0',
                cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px -4px rgba(0,0,0,0.1)'
              }}
            >
              <ChevronLeft size={24} color={currentIndex === 0 ? '#94A3B8' : '#0F172A'} />
            </button>

            <button
              onClick={nextSlide}
              disabled={currentIndex === slides.length - 1}
              style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: currentIndex === slides.length - 1 ? '#E2E8F0' : 'white',
                border: '1px solid #E2E8F0',
                cursor: currentIndex === slides.length - 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px -4px rgba(0,0,0,0.1)'
              }}
            >
              <ChevronRight size={24} color={currentIndex === slides.length - 1 ? '#94A3B8' : '#0F172A'} />
            </button>
          </div>

          {/* Slide Thumbnails */}
          <div style={{
            height: '80px',
            borderTop: '1px solid #E2E8F0',
            padding: '12px 20px',
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            background: 'white'
          }}>
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => goToSlide(i)}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '10px',
                  border: currentIndex === i ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                  background: slide.photo ? `url(${slide.photoBase64 || slide.photo}) center/cover` : '#F1F5F9',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: currentIndex === i ? 1 : 0.7,
                  transition: 'all 0.2s ease'
                }}
              >
                {!slide.photo && (
                  <FileText size={18} color="#64748B" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Susan AI Sidebar */}
        {showSidebar && (
          <SusanAISidebar
            currentSlideIndex={currentIndex}
            slideTitle={currentSlide.title}
            damageType={currentSlide.analysis?.damageType}
            severity={currentSlide.analysis?.severity}
            isInsuranceRelevant={currentSlide.analysis?.insuranceRelevant}
            propertyAddress={propertyAddress}
            homeownerName={homeownerName}
            onToggle={() => setShowSidebar(false)}
            isOpen={true}
          />
        )}
      </div>
    </div>
  );
};

export default InspectionPresenterV2;
