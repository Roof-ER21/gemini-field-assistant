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
import { ClaimAuthorizationSlide } from './ClaimAuthorizationSlide';
import { ContingencyAgreementSlide } from './ContingencyAgreementSlide';
import { RepLandingSlide } from './RepLandingSlide';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface PhotoAnalysis {
  damageDetected?: boolean;
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe' | 'critical' | 'none';
  location: string;
  description: string;
  recommendations: string[];
  insuranceRelevant: boolean;
  estimatedRepairCost?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical' | 'none';
  photoType?: 'damage' | 'overview' | 'detail' | 'context';
}

interface PresentationSlide {
  id: string;
  type: 'cover' | 'rep_profile' | 'photo' | 'summary' | 'recommendations' | 'cta' | 'claim_authorization' | 'contingency' | 'thank_you';
  title: string;
  content?: string;
  photo?: string;
  photoBase64?: string;
  photoId?: string; // Database photo ID for persistence
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

interface HomeownerInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface ClaimAuthorizationData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerEmail: string;
  insuranceCompany: string;
  claimNumber: string;
  customerSignature: string | null;
  signedAt: string | null;
}

interface ContingencyAgreementData {
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerEmail: string;
  insuranceCompany: string;
  claimNumber: string;
  deductible: string;
  notes: string;
  agentSignature: string | null;
  customerSignature1: string | null;
  customerSignature2: string | null;
  signedAt: string | null;
}

interface InspectionPresenterV2Props {
  slides: PresentationSlide[];
  jobId?: string;
  propertyAddress?: string;
  homeownerName?: string;
  homeownerInfo?: HomeownerInfo;
  userProfile?: UserProfile;
  presentationId?: string;
  onClose?: () => void;
  onShare?: () => void;
  onAgreementSigned?: (type: 'claim_authorization' | 'contingency', data: ClaimAuthorizationData | ContingencyAgreementData) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const InspectionPresenterV2: React.FC<InspectionPresenterV2Props> = ({
  slides,
  jobId,
  propertyAddress,
  homeownerName,
  homeownerInfo,
  userProfile,
  presentationId,
  onClose,
  onShare,
  onAgreementSigned
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

  // State for agreement data flow
  const [claimAuthData, setClaimAuthData] = useState<ClaimAuthorizationData | null>(null);

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
      case 'claim_authorization':
        return renderClaimAuthorizationSlide();
      case 'contingency':
        return renderContingencySlide();
      case 'thank_you':
        return renderThankYouSlide();
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
      padding: '60px',
      background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)'
    }}>
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '24px',
        background: 'rgba(255, 255, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '40px',
        backdropFilter: 'blur(10px)'
      }}>
        <Shield size={64} color="white" />
      </div>
      <h1 style={{
        fontSize: '56px',
        fontWeight: '800',
        color: 'white',
        margin: 0,
        letterSpacing: '-0.02em'
      }}>
        Roof Inspection Report
      </h1>
      <p style={{
        fontSize: '32px',
        color: 'rgba(255, 255, 255, 0.9)',
        margin: '24px 0 0 0',
        fontWeight: '500'
      }}>
        {propertyAddress || currentSlide.content}
      </p>
      <p style={{
        fontSize: '20px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: '48px'
      }}>
        {new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })}
      </p>
      {userProfile?.company && (
        <div style={{
          marginTop: '60px',
          padding: '12px 24px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          fontSize: '18px',
          fontWeight: '600'
        }}>
          {userProfile.company}
        </div>
      )}
    </div>
  );

  const renderRepProfileSlide = () => {
    const profile = currentSlide.content ? JSON.parse(currentSlide.content) : userProfile;
    if (!profile) return renderCoverSlide();

    return (
      <RepLandingSlide
        repProfile={{
          name: profile.name,
          title: profile.title,
          company: profile.company,
          email: profile.email,
          phone: profile.phone,
          photoUrl: profile.photoUrl,
          credentials: profile.credentials,
          slug: profile.slug,
          startYear: profile.startYear
        }}
        homeownerName={homeownerName}
        propertyAddress={propertyAddress}
      />
    );
  };

  const renderPhotoSlide = () => {
    const analysis = currentSlide.analysis;
    const photoSrc = currentSlide.photoBase64 || currentSlide.photo;
    // Check if this slide has actual damage (not a "no damage" photo)
    const hasDamage = analysis?.damageDetected !== false &&
                      analysis?.severity !== 'none' &&
                      analysis?.damageType !== 'No damage detected';

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '40px',
        background: '#000000'
      }}>
        {/* Large Photo - 85% of screen */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {photoSrc && (
            <img
              src={photoSrc}
              alt={currentSlide.title}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '12px'
              }}
            />
          )}

          {/* Only show severity badge if damage was detected */}
          {hasDamage && analysis?.severity && (
            <div style={{
              position: 'absolute',
              top: '24px',
              left: '24px',
              padding: '16px 28px',
              borderRadius: '16px',
              fontSize: '28px',
              fontWeight: '800',
              textTransform: 'uppercase',
              background: getSeverityColor(analysis.severity).bg,
              color: 'white',
              boxShadow: '0 8px 32px -8px rgba(0,0,0,0.5)',
              letterSpacing: '0.05em'
            }}>
              {analysis.severity}
            </div>
          )}

          {/* Damage Type Label OR simple photo title */}
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '20px 40px',
            borderRadius: '16px',
            fontSize: '32px',
            fontWeight: '700',
            background: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            boxShadow: '0 8px 32px -8px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            textAlign: 'center',
            maxWidth: '80%'
          }}>
            {hasDamage
              ? (analysis?.damageType || currentSlide.title)
              : (currentSlide.content || currentSlide.title || 'Property Photo')}
          </div>

          {/* Insurance Badge - Top Right Corner (only if damage is relevant) */}
          {hasDamage && analysis?.insuranceRelevant && (
            <div style={{
              position: 'absolute',
              top: '24px',
              right: '24px',
              padding: '16px 28px',
              borderRadius: '16px',
              fontSize: '24px',
              fontWeight: '700',
              background: '#22C55E',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 8px 32px -8px rgba(34, 197, 94, 0.5)'
            }}>
              <Shield size={28} />
              CLAIM ELIGIBLE
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSummarySlide = () => {
    const summary = currentSlide.content ? JSON.parse(currentSlide.content) : {};
    const totalPhotos = summary.totalPhotos || 0;
    const damagePoints = summary.damagePoints || 0;
    const criticalIssues = summary.criticalIssues || 0;
    const insuranceRelevant = summary.insuranceRelevant || 0;
    const overallAssessment = summary.overallAssessment || '';
    const noDamageFound = damagePoints === 0;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '60px',
        background: noDamageFound
          ? 'linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)'
      }}>
        {noDamageFound ? (
          // No Damage Found - Green/Positive Message
          <>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '30px',
              background: '#22C55E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 48px -12px rgba(34, 197, 94, 0.5)',
              marginBottom: '32px'
            }}>
              <CheckCircle2 size={64} color="white" strokeWidth={3} />
            </div>
            <h2 style={{
              fontSize: '56px',
              fontWeight: '900',
              color: '#166534',
              margin: 0,
              textAlign: 'center'
            }}>
              Your Roof Looks Good
            </h2>
            <p style={{
              fontSize: '28px',
              fontWeight: '500',
              color: '#15803D',
              margin: '24px 0 0 0',
              textAlign: 'center',
              maxWidth: '700px'
            }}>
              No significant storm damage was detected during this inspection
            </p>
            <p style={{
              fontSize: '18px',
              color: '#166534',
              marginTop: '48px'
            }}>
              {totalPhotos} photos documented for your records
            </p>
          </>
        ) : (
          // Damage Found - Show Stats
          <>
            <h2 style={{
              fontSize: '72px',
              fontWeight: '900',
              color: criticalIssues > 0 ? '#DC2626' : '#D97706',
              margin: 0,
              textAlign: 'center',
              lineHeight: '1.1'
            }}>
              {damagePoints}
            </h2>
            <p style={{
              fontSize: '40px',
              fontWeight: '700',
              color: '#0F172A',
              margin: '16px 0 0 0'
            }}>
              Damage Point{damagePoints !== 1 ? 's' : ''} Found
            </p>

            {/* Stats Row */}
            <div style={{
              display: 'flex',
              gap: '32px',
              marginTop: '64px',
              alignItems: 'center'
            }}>
              {/* Critical */}
              {criticalIssues > 0 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '24px',
                    background: '#DC2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px -8px rgba(220, 38, 38, 0.5)'
                  }}>
                    <span style={{ fontSize: '48px', fontWeight: '900', color: 'white' }}>
                      {criticalIssues}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: '#DC2626',
                    textTransform: 'uppercase'
                  }}>
                    CRITICAL
                  </span>
                </div>
              )}

              {/* Insurance Eligible */}
              {insuranceRelevant > 0 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '24px',
                    background: '#22C55E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px -8px rgba(34, 197, 94, 0.5)'
                  }}>
                    <span style={{ fontSize: '48px', fontWeight: '900', color: 'white' }}>
                      {insuranceRelevant}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: '#166534',
                    textTransform: 'uppercase'
                  }}>
                    CLAIM ELIGIBLE
                  </span>
                </div>
              )}
            </div>

            {/* Assessment */}
            {overallAssessment && (
              <p style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#475569',
                marginTop: '48px',
                textAlign: 'center',
                maxWidth: '700px'
              }}>
                {overallAssessment}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  const renderRecommendationsSlide = () => {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '60px',
        background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)'
      }}>
        {/* Simple Icon Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '48px',
          maxWidth: '900px'
        }}>
          {/* File Claim */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '30px',
              background: '#22C55E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 48px -12px rgba(34, 197, 94, 0.5)'
            }}>
              <CheckCircle2 size={64} color="white" strokeWidth={3} />
            </div>
            <span style={{
              fontSize: '36px',
              fontWeight: '800',
              color: '#166534',
              textTransform: 'uppercase',
              letterSpacing: '0.02em'
            }}>
              FILE CLAIM
            </span>
          </div>

          {/* Free Inspection */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '30px',
              background: '#c41e3a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 48px -12px rgba(196, 30, 58, 0.5)'
            }}>
              <FileText size={64} color="white" strokeWidth={3} />
            </div>
            <span style={{
              fontSize: '36px',
              fontWeight: '800',
              color: '#a01830',
              textTransform: 'uppercase',
              letterSpacing: '0.02em'
            }}>
              FREE INSPECTION
            </span>
          </div>

          {/* Insurance Approved */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '30px',
              background: '#4b5563',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 48px -12px rgba(75, 85, 99, 0.5)'
            }}>
              <Shield size={64} color="white" strokeWidth={3} />
            </div>
            <span style={{
              fontSize: '36px',
              fontWeight: '800',
              color: '#1f2937',
              textTransform: 'uppercase',
              letterSpacing: '0.02em'
            }}>
              APPROVED
            </span>
          </div>

          {/* Act Now */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '30px',
              background: '#F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 48px -12px rgba(245, 158, 11, 0.5)'
            }}>
              <AlertTriangle size={64} color="white" strokeWidth={3} />
            </div>
            <span style={{
              fontSize: '36px',
              fontWeight: '800',
              color: '#92400E',
              textTransform: 'uppercase',
              letterSpacing: '0.02em'
            }}>
              ACT NOW
            </span>
          </div>
        </div>

        {/* Single CTA Sentence */}
        <p style={{
          fontSize: '28px',
          fontWeight: '600',
          color: '#166534',
          marginTop: '80px',
          textAlign: 'center',
          maxWidth: '800px'
        }}>
          We handle everything from inspection to completion
        </p>
      </div>
    );
  };

  const renderCtaSlide = () => {
    const ctaContent = currentSlide.content ? JSON.parse(currentSlide.content) : {};
    const message = ctaContent.message || '';
    const nextSteps = ctaContent.nextSteps || [];
    const showAgreement = ctaContent.showAgreement === true;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'center',
        padding: '60px',
        background: showAgreement
          ? 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)'
          : 'linear-gradient(135deg, #4b5563 0%, #1f2937 100%)'
      }}>
        {/* Main Headline */}
        <h2 style={{
          fontSize: '64px',
          fontWeight: '900',
          color: 'white',
          margin: 0,
          letterSpacing: '-0.02em'
        }}>
          {currentSlide.title}
        </h2>

        {/* Message */}
        {message && (
          <p style={{
            fontSize: '28px',
            fontWeight: '500',
            color: 'rgba(255, 255, 255, 0.95)',
            margin: '32px 0 0 0',
            maxWidth: '800px'
          }}>
            {message}
          </p>
        )}

        {/* Next Steps */}
        {nextSteps.length > 0 && (
          <div style={{
            marginTop: '48px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center'
          }}>
            {nextSteps.map((step, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 32px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '800',
                  color: showAgreement ? '#c41e3a' : '#1f2937'
                }}>
                  {i + 1}
                </div>
                <span style={{
                  fontSize: '22px',
                  fontWeight: '600',
                  color: 'white'
                }}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Rep Contact Info - Smaller at Bottom */}
        {userProfile && (
          <div style={{
            marginTop: '60px',
            display: 'flex',
            gap: '24px',
            alignItems: 'center'
          }}>
            {userProfile.phone && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 28px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)'
              }}>
                <Phone size={24} color="white" />
                <span style={{ fontSize: '22px', fontWeight: '600', color: 'white' }}>
                  {userProfile.phone}
                </span>
              </div>
            )}
            {userProfile.name && (
              <span style={{
                fontSize: '22px',
                fontWeight: '600',
                color: 'rgba(255, 255, 255, 0.9)'
              }}>
                {userProfile.name}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // AGREEMENT SLIDES
  // ============================================================================

  const handleClaimAuthComplete = async (data: ClaimAuthorizationData) => {
    setClaimAuthData(data);

    // Save to API
    try {
      const response = await fetch('/api/agreements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userProfile?.email || ''
        },
        body: JSON.stringify({
          agreementType: 'claim_authorization',
          presentationId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          insuranceCompany: data.insuranceCompany,
          claimNumber: data.claimNumber,
          customerSignature1: data.customerSignature
        })
      });

      if (response.ok) {
        console.log('Claim Authorization saved');
        onAgreementSigned?.('claim_authorization', data);
      }
    } catch (error) {
      console.error('Error saving claim authorization:', error);
    }

    // Move to next slide
    nextSlide();
  };

  const handleContingencyComplete = async (data: ContingencyAgreementData) => {
    // Save to API
    try {
      const response = await fetch('/api/agreements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userProfile?.email || ''
        },
        body: JSON.stringify({
          agreementType: 'contingency',
          presentationId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          insuranceCompany: data.insuranceCompany,
          claimNumber: data.claimNumber,
          deductible: parseFloat(data.deductible.replace(/[^0-9.-]/g, '')) || 0,
          notes: data.notes,
          agentSignature: data.agentSignature,
          agentName: userProfile?.name,
          customerSignature1: data.customerSignature1,
          customerSignature2: data.customerSignature2
        })
      });

      if (response.ok) {
        console.log('Contingency Agreement saved');
        onAgreementSigned?.('contingency', data);
      }
    } catch (error) {
      console.error('Error saving contingency agreement:', error);
    }

    // Move to next slide (thank you)
    nextSlide();
  };

  const renderClaimAuthorizationSlide = () => (
    <ClaimAuthorizationSlide
      initialData={{
        customerName: homeownerInfo?.name || homeownerName || '',
        customerAddress: homeownerInfo?.address || propertyAddress || '',
        customerPhone: homeownerInfo?.phone || '',
        customerEmail: homeownerInfo?.email || ''
      }}
      onComplete={handleClaimAuthComplete}
      onSkip={nextSlide}
    />
  );

  const renderContingencySlide = () => (
    <ContingencyAgreementSlide
      initialData={{
        customerName: claimAuthData?.customerName || homeownerInfo?.name || homeownerName || '',
        customerAddress: claimAuthData?.customerAddress || homeownerInfo?.address || propertyAddress || '',
        customerPhone: claimAuthData?.customerPhone || homeownerInfo?.phone || '',
        customerEmail: claimAuthData?.customerEmail || homeownerInfo?.email || '',
        insuranceCompany: claimAuthData?.insuranceCompany || '',
        claimNumber: claimAuthData?.claimNumber || ''
      }}
      agentName={userProfile?.name}
      onComplete={handleContingencyComplete}
      onBack={prevSlide}
    />
  );

  const renderThankYouSlide = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      textAlign: 'center',
      padding: '60px',
      background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
    }}>
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '40px',
        backdropFilter: 'blur(10px)'
      }}>
        <CheckCircle2 size={64} color="white" />
      </div>

      <h1 style={{
        fontSize: '56px',
        fontWeight: '800',
        color: 'white',
        margin: '0 0 24px 0',
        lineHeight: '1.1'
      }}>
        You're All Set!
      </h1>

      <p style={{
        fontSize: '28px',
        color: 'rgba(255, 255, 255, 0.9)',
        margin: '0 0 48px 0',
        maxWidth: '700px',
        lineHeight: '1.5'
      }}>
        Thank you for trusting us with your roof repair. We'll contact your insurance company within 24 hours.
      </p>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        marginBottom: '48px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '20px 40px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(10px)'
        }}>
          <Mail size={28} color="white" />
          <span style={{ fontSize: '22px', color: 'white' }}>
            Signed documents sent to your email
          </span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '20px 40px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(10px)'
        }}>
          <Phone size={28} color="white" />
          <span style={{ fontSize: '22px', color: 'white' }}>
            We'll call you with updates
          </span>
        </div>
      </div>

      {/* Rep Info */}
      {userProfile && (
        <div style={{
          padding: '24px 48px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
        }}>
          {userProfile.photoUrl && (
            <img
              src={userProfile.photoUrl}
              alt={userProfile.name}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid white'
              }}
            />
          )}
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: 'white' }}>
              {userProfile.name}
            </div>
            {userProfile.phone && (
              <div style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.9)' }}>
                {userProfile.phone}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: '#DC2626' };
      case 'severe': return { bg: '#EA580C' };
      case 'moderate': return { bg: '#D97706' };
      case 'minor': return { bg: '#16A34A' };
      case 'none': return { bg: '#64748B' };
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
              background: 'linear-gradient(90deg, #c41e3a 0%, #a01830 100%)',
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
              background: isAutoPlaying ? '#c41e3a' : '#F1F5F9',
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
              background: showSidebar ? '#c41e3a' : '#F1F5F9',
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
                background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)',
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
                  border: currentIndex === i ? '2px solid #c41e3a' : '1px solid #E2E8F0',
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
