/**
 * PhotoReviewModal - Pre-generation photo review with warnings
 * Shows issues with photos before generating presentation
 * Allows rep to exclude photos or manually mark damage types
 */

import React, { useState } from 'react';
import {
  X, AlertTriangle, CheckCircle2, XCircle, Camera,
  CloudRain, Wind, Clock, Package, Zap, Droplets
} from 'lucide-react';
import { Button } from '../ui/button';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type DamageType =
  | 'hail'
  | 'wind'
  | 'out_of_code'
  | 'discontinued'
  | 'impact'
  | 'water';

export interface PhotoIssue {
  photoId: string;
  issueType: 'no_damage' | 'low_quality' | 'uncertain';
  description: string;
  canManuallyMark: boolean;
}

export interface ManualDamageOverride {
  photoId: string;
  damageTypes: DamageType[];
  notes?: string;
  overriddenAt: string;
}

interface PhotoWithIssue {
  id: string;
  preview: string;
  issue: PhotoIssue;
  excluded: boolean;
  override?: ManualDamageOverride;
}

interface PhotoReviewModalProps {
  isOpen: boolean;
  photos: Array<{
    id: string;
    preview: string;
    analysis?: {
      damageDetected?: boolean;
      description?: string;
      photoType?: string;
      severity?: string;
      confidence?: 'low' | 'medium' | 'high';
      possibleDamageTypes?: string[];
      shingleType?: string;
      shingleCondition?: string;
      estimatedAge?: string;
    };
    status: string;
  }>;
  onClose: () => void;
  onConfirm: (
    excludedPhotoIds: string[],
    overrides: ManualDamageOverride[]
  ) => void;
}

// ============================================================================
// DAMAGE TYPE LABELS
// ============================================================================

const DAMAGE_TYPES: Array<{ type: DamageType; label: string; icon: React.ReactNode; color: string }> = [
  { type: 'hail', label: 'Hail Damage', icon: <CloudRain size={18} />, color: '#2563EB' },
  { type: 'wind', label: 'Wind Damage', icon: <Wind size={18} />, color: '#7C3AED' },
  { type: 'out_of_code', label: 'Out of Code', icon: <Clock size={18} />, color: '#D97706' },
  { type: 'discontinued', label: 'Discontinued', icon: <Package size={18} />, color: '#DC2626' },
  { type: 'impact', label: 'Impact Damage', icon: <Zap size={18} />, color: '#059669' },
  { type: 'water', label: 'Water Damage', icon: <Droplets size={18} />, color: '#0891B2' }
];

// ============================================================================
// COMPONENT
// ============================================================================

export const PhotoReviewModal: React.FC<PhotoReviewModalProps> = ({
  isOpen,
  photos,
  onClose,
  onConfirm
}) => {
  // Identify photos with issues (including low/medium confidence)
  const photosWithIssues: PhotoWithIssue[] = photos
    .filter(photo => {
      // No damage detected
      if (photo.analysis?.damageDetected === false) return true;
      // Low quality / error
      if (photo.status === 'error') return true;
      // Context photo (not direct damage)
      if (photo.analysis?.photoType === 'context') return true;
      // Severity is none
      if (photo.analysis?.severity === 'none') return true;
      // Low confidence - needs rep verification
      if (photo.analysis?.confidence === 'low') return true;
      // Medium confidence with possible damage types - let rep choose
      if (photo.analysis?.confidence === 'medium' && photo.analysis?.possibleDamageTypes?.length) return true;
      return false;
    })
    .map(photo => {
      // Determine issue type based on analysis
      let issueType: 'no_damage' | 'low_quality' | 'uncertain' = 'no_damage';
      let description = photo.analysis?.description || 'No details available';

      if (photo.status === 'error') {
        issueType = 'low_quality';
      } else if (photo.analysis?.confidence === 'low' || photo.analysis?.confidence === 'medium') {
        issueType = 'uncertain';
        // Add confidence info to description
        const conf = photo.analysis?.confidence || 'unknown';
        const possibleTypes = photo.analysis?.possibleDamageTypes?.join(', ') || '';
        if (possibleTypes) {
          description = `${description} (AI confidence: ${conf}, possible: ${possibleTypes})`;
        }
      } else if (photo.analysis?.severity === 'none' && photo.analysis?.description?.toLowerCase().includes('possible')) {
        issueType = 'uncertain';
      }

      // Add shingle info if available
      if (photo.analysis?.shingleCondition === 'discontinued' || photo.analysis?.shingleCondition === 'deteriorated') {
        description = `${description} | Shingles: ${photo.analysis.shingleType || 'unknown'} (${photo.analysis.shingleCondition})`;
        if (photo.analysis.estimatedAge) {
          description = `${description}, est. ${photo.analysis.estimatedAge} old`;
        }
      }

      return {
        id: photo.id,
        preview: photo.preview,
        issue: {
          photoId: photo.id,
          issueType,
          description,
          canManuallyMark: photo.status !== 'error'
        },
        excluded: false,
        override: undefined
      };
    });

  // State for each photo
  const [photoStates, setPhotoStates] = useState<PhotoWithIssue[]>(photosWithIssues);
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);

  // If no issues, don't show modal
  if (!isOpen || photosWithIssues.length === 0) {
    return null;
  }

  const toggleExclude = (photoId: string) => {
    setPhotoStates(prev => prev.map(p =>
      p.id === photoId ? { ...p, excluded: !p.excluded, override: undefined } : p
    ));
  };

  const toggleDamageType = (photoId: string, damageType: DamageType) => {
    setPhotoStates(prev => prev.map(p => {
      if (p.id !== photoId) return p;

      const currentTypes = p.override?.damageTypes || [];
      const newTypes = currentTypes.includes(damageType)
        ? currentTypes.filter(t => t !== damageType)
        : [...currentTypes, damageType];

      return {
        ...p,
        excluded: false,
        override: newTypes.length > 0 ? {
          photoId,
          damageTypes: newTypes,
          overriddenAt: new Date().toISOString()
        } : undefined
      };
    }));
  };

  const handleConfirm = () => {
    const excludedIds = photoStates.filter(p => p.excluded).map(p => p.id);
    const overrides = photoStates
      .filter(p => p.override && !p.excluded)
      .map(p => p.override!);

    onConfirm(excludedIds, overrides);
    onClose();
  };

  const excludedCount = photoStates.filter(p => p.excluded).length;
  const overrideCount = photoStates.filter(p => p.override && !p.excluded).length;
  const keepAsIsCount = photoStates.filter(p => !p.excluded && !p.override).length;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '24px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 80px -24px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={24} color="#D97706" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#0F172A' }}>
                Review Photos Before Generating
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748B' }}>
                {photosWithIssues.length} photo{photosWithIssues.length !== 1 ? 's' : ''} may need attention
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              border: 'none',
              background: '#F1F5F9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        {/* Photo List */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px 28px'
        }}>
          {photoStates.map((photo, index) => (
            <div
              key={photo.id}
              style={{
                marginBottom: index < photoStates.length - 1 ? '16px' : 0,
                borderRadius: '16px',
                border: `2px solid ${photo.excluded ? '#EF4444' : photo.override ? '#22C55E' : '#E2E8F0'}`,
                overflow: 'hidden',
                background: photo.excluded ? '#FEF2F2' : 'white',
                opacity: photo.excluded ? 0.7 : 1,
                transition: 'all 0.2s'
              }}
            >
              {/* Photo Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px'
              }}>
                {/* Thumbnail */}
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  position: 'relative'
                }}>
                  <img
                    src={photo.preview}
                    alt="Photo"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {photo.excluded && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(239, 68, 68, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <XCircle size={32} color="white" />
                    </div>
                  )}
                </div>

                {/* Issue Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background: photo.issue.issueType === 'no_damage' ? '#FEF3C7' :
                                  photo.issue.issueType === 'low_quality' ? '#FEE2E2' : '#E0E7FF',
                      color: photo.issue.issueType === 'no_damage' ? '#92400E' :
                             photo.issue.issueType === 'low_quality' ? '#DC2626' : '#4338CA'
                    }}>
                      {photo.issue.issueType === 'no_damage' ? 'No Damage Detected' :
                       photo.issue.issueType === 'low_quality' ? 'Low Quality' : 'Uncertain Damage'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.4' }}>
                    {photo.issue.description}
                  </p>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => toggleExclude(photo.id)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: photo.excluded ? '#DC2626' : '#F1F5F9',
                      color: photo.excluded ? 'white' : '#475569',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {photo.excluded ? <XCircle size={16} /> : <X size={16} />}
                    {photo.excluded ? 'Excluded' : 'Exclude'}
                  </button>

                  {photo.issue.canManuallyMark && !photo.excluded && (
                    <button
                      onClick={() => setExpandedPhotoId(
                        expandedPhotoId === photo.id ? null : photo.id
                      )}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: photo.override ? '#22C55E' : '#c41e3a',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {photo.override ? <CheckCircle2 size={16} /> : <Camera size={16} />}
                      {photo.override
                        ? `${photo.override.damageTypes.length} Selected`
                        : 'Mark Damage'}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Damage Type Selection */}
              {expandedPhotoId === photo.id && !photo.excluded && photo.issue.canManuallyMark && (
                <div style={{
                  padding: '16px',
                  borderTop: '1px solid #E2E8F0',
                  background: '#F8FAFC'
                }}>
                  <p style={{
                    margin: '0 0 12px 0',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#475569'
                  }}>
                    What damage do you see? (Select all that apply)
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px'
                  }}>
                    {DAMAGE_TYPES.map(({ type, label, icon, color }) => {
                      const isSelected = photo.override?.damageTypes.includes(type);
                      return (
                        <button
                          key={type}
                          onClick={() => toggleDamageType(photo.id, type)}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '10px',
                            border: `2px solid ${isSelected ? color : '#E2E8F0'}`,
                            background: isSelected ? `${color}15` : 'white',
                            color: isSelected ? color : '#475569',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'all 0.2s'
                          }}
                        >
                          <span style={{ color: isSelected ? color : '#94A3B8' }}>
                            {icon}
                          </span>
                          {label}
                          {isSelected && (
                            <CheckCircle2 size={16} style={{ marginLeft: 'auto' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 28px',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#F8FAFC'
        }}>
          {/* Summary */}
          <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
            <span style={{ color: '#22C55E', fontWeight: '600' }}>
              {overrideCount} marked with damage
            </span>
            <span style={{ color: '#64748B' }}>
              {keepAsIsCount} kept as-is
            </span>
            <span style={{ color: '#EF4444', fontWeight: '600' }}>
              {excludedCount} excluded
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              onClick={onClose}
              style={{
                padding: '12px 24px',
                background: '#F1F5F9',
                color: '#475569',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              style={{
                padding: '12px 32px',
                background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px -4px rgba(196, 30, 58, 0.5)'
              }}
            >
              Generate Presentation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoReviewModal;
