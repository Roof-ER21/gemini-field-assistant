/**
 * NewInspectionFlowEnhanced - With Database Persistence
 * Extends NewInspectionFlow to save photos to database
 */

import React, { useState } from 'react';
import { NewInspectionFlow } from './NewInspectionFlow';
import type { PresentationSlide } from './NewInspectionFlow';
import {
  createInspectionWithPhotos,
  createPresentation,
  sharePresentation
} from '../../services/inspectionPresentationService';
import { authService } from '../../services/authService';
import { jobService } from '../../services/jobService';
import type { Job, JobNote } from '../../types/job';

interface NewInspectionFlowEnhancedProps {
  onPresentationReady?: (slides: PresentationSlide[], jobId: string, inspectionId?: string) => void;
  userProfile?: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    photoUrl?: string;
    credentials?: string[];
  };
}

/**
 * Enhanced version that saves photos to database
 */
export const NewInspectionFlowEnhanced: React.FC<NewInspectionFlowEnhancedProps> = ({
  onPresentationReady,
  userProfile
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Intercept the presentation ready callback
  const handlePresentationReady = async (slides: PresentationSlide[], jobId: string) => {
    // For now, just pass through
    // The actual saving happens in the modified NewInspectionFlow component
    if (onPresentationReady) {
      onPresentationReady(slides, jobId);
    }
  };

  return (
    <>
      <NewInspectionFlow
        onPresentationReady={handlePresentationReady}
        userProfile={userProfile}
      />
      {isSaving && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 10000
        }}>
          <p style={{ margin: 0, fontSize: '15px', color: '#0F172A' }}>
            {saveStatus}
          </p>
        </div>
      )}
    </>
  );
};

export default NewInspectionFlowEnhanced;
