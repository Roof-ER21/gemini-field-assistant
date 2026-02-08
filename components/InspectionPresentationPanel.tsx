/**
 * InspectionPresentationPanel - Simplified 2-Step Flow
 * Step 1: Upload photos & homeowner info (NewInspectionFlow)
 * Step 2: Present with Susan AI sidebar (InspectionPresenterV2)
 */

import React, { useState } from 'react';
import { NewInspectionFlow } from './inspection/NewInspectionFlow';
import { InspectionPresenterV2 } from './inspection/InspectionPresenterV2';
import { authService } from '../services/authService';

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

// ============================================================================
// COMPONENT
// ============================================================================

export const InspectionPresentationPanel: React.FC = () => {
  // State
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [jobId, setJobId] = useState<string>('');
  const [isPresenting, setIsPresenting] = useState(false);
  const [homeownerInfo, setHomeownerInfo] = useState<{
    name?: string;
    address?: string;
  }>({});

  // Get current user profile
  const currentUser = authService.getCurrentUser();
  const userProfile: UserProfile | undefined = currentUser ? {
    name: currentUser.name || currentUser.email?.split('@')[0] || 'Sales Representative',
    email: currentUser.email || '',
    company: 'Roof-ER Roofing',
    phone: '', // Phone not available in AuthUser
    credentials: ['Licensed Contractor', 'Insurance Specialist', 'GAF Certified']
  } : undefined;

  // Handle presentation ready
  const handlePresentationReady = (generatedSlides: PresentationSlide[], newJobId: string) => {
    setSlides(generatedSlides);
    setJobId(newJobId);
    setIsPresenting(true);
  };

  // Handle close presentation
  const handleClosePresentation = () => {
    setIsPresenting(false);
  };

  // Handle share
  const handleShare = async () => {
    // Generate shareable link
    const shareUrl = `${window.location.origin}/present/${jobId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    } catch {
      alert(`Share this link: ${shareUrl}`);
    }
  };

  // Reset to new inspection
  const handleReset = () => {
    setSlides([]);
    setJobId('');
    setIsPresenting(false);
    setHomeownerInfo({});
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Step 2: Presenting
  if (isPresenting && slides.length > 0) {
    return (
      <InspectionPresenterV2
        slides={slides}
        jobId={jobId}
        propertyAddress={homeownerInfo.address}
        homeownerName={homeownerInfo.name}
        userProfile={userProfile}
        onClose={handleClosePresentation}
        onShare={handleShare}
      />
    );
  }

  // Step 1: Upload & Setup
  return (
    <NewInspectionFlow
      onPresentationReady={handlePresentationReady}
      userProfile={userProfile}
    />
  );
};

export default InspectionPresentationPanel;
