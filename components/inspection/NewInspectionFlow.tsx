/**
 * NewInspectionFlow - Simplified 2-Step Inspection Presentation
 * Step 1: Collect homeowner info + upload photos (this component)
 * Step 2: Full-screen presentation with Susan AI sidebar
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  User, Phone, MapPin, Camera, CloudUpload, Sparkles, CheckCircle2,
  X, Loader2, AlertCircle, Play, ChevronDown, ChevronUp, Home,
  Shield, AlertTriangle, Zap, ArrowRight
} from 'lucide-react';
import { Button } from '../ui/button';
import { analyzeImage } from '../../services/geminiService';
import { jobService } from '../../services/jobService';
import { authService } from '../../services/authService';
import {
  createInspectionWithPhotos,
  createPresentation
} from '../../services/inspectionPresentationService';
import type { Job, JobNote } from '../../types/job';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface HomeownerInfo {
  name: string;
  phone: string;
  address: string;
}

interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
  base64?: string;
  status: 'uploading' | 'analyzing' | 'complete' | 'error';
  analysis?: PhotoAnalysis;
  error?: string;
}

export interface PhotoAnalysis {
  damageDetected: boolean;
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

interface NewInspectionFlowProps {
  onPresentationReady?: (slides: PresentationSlide[], jobId: string) => void;
  userProfile?: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    photoUrl?: string;
    credentials?: string[];
    title?: string;
    slug?: string;
    startYear?: number;
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const NewInspectionFlow: React.FC<NewInspectionFlowProps> = ({
  onPresentationReady,
  userProfile
}) => {
  // State
  const [homeownerInfo, setHomeownerInfo] = useState<HomeownerInfo>({
    name: '',
    phone: '',
    address: ''
  });
  const [showHomeownerForm, setShowHomeownerForm] = useState(true);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Constants
  const maxPhotos = 20;
  const completedCount = photos.filter(p => p.status === 'complete').length;
  const analyzingCount = photos.filter(p => p.status === 'analyzing').length;
  const progress = photos.length > 0 ? (completedCount / photos.length) * 100 : 0;
  // Only count photos with ACTUAL damage detected
  const damagePhotos = photos.filter(p => p.analysis?.damageDetected === true);
  const criticalCount = damagePhotos.filter(p =>
    p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe'
  ).length;
  const insuranceCount = damagePhotos.filter(p => p.analysis?.insuranceRelevant).length;

  // ============================================================================
  // PHOTO HANDLING
  // ============================================================================

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .slice(0, maxPhotos - photos.length);

    if (fileArray.length === 0) return;

    // Create photo objects
    const newPhotos: UploadedPhoto[] = fileArray.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading' as const
    }));

    setPhotos(prev => [...prev, ...newPhotos]);

    // Analyze each photo
    for (const photo of newPhotos) {
      try {
        // Update to analyzing status
        setPhotos(prev => prev.map(p =>
          p.id === photo.id ? { ...p, status: 'analyzing' } : p
        ));

        // Convert to base64
        const base64Full = await fileToBase64(photo.file);
        const base64Data = base64Full.split(',')[1];

        // AI Analysis prompt - HONEST damage assessment
        const prompt = `You are a professional roofing damage assessment expert. Analyze this photo HONESTLY.

CRITICAL INSTRUCTION: Do NOT fabricate or exaggerate damage. If this photo does NOT show clear evidence of storm damage (hail, wind, impact), say so honestly.

First, determine if this photo shows actual damage:
- Hail impacts (circular dents, displaced granules)
- Wind damage (lifted/missing shingles, exposed underlayment)
- Impact damage (punctures, cracks)
- Water damage (staining, rot)

If NO clear damage is visible, respond with:
{
  "damageDetected": false,
  "photoType": "overview|detail|context",
  "damageType": "No damage detected",
  "severity": "none",
  "location": "where on roof this photo shows",
  "description": "Brief neutral description of what the photo shows (e.g., 'Overall view of asphalt shingle roof in good condition')",
  "recommendations": [],
  "insuranceRelevant": false,
  "urgency": "none"
}

If CLEAR damage IS visible, respond with:
{
  "damageDetected": true,
  "photoType": "damage",
  "damageType": "specific type (e.g., 'Hail Impact Damage', 'Wind-Lifted Shingles')",
  "severity": "minor|moderate|severe|critical",
  "location": "specific location on roof",
  "description": "detailed description of the damage and what it means for the homeowner",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "insuranceRelevant": true/false,
  "estimatedRepairCost": "cost range if applicable",
  "urgency": "low|medium|high|critical"
}

Remember: Homeowners trust this assessment. Be honest and professional.`;

        const response = await analyzeImage(base64Data, photo.file.type, prompt);

        // Parse response
        let analysis: PhotoAnalysis;
        try {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Ensure damageDetected field exists
            analysis = {
              ...parsed,
              damageDetected: parsed.damageDetected ?? (parsed.severity !== 'none' && parsed.damageType !== 'No damage detected')
            };
          } else {
            // Fallback - assume no damage if we can't parse
            analysis = {
              damageDetected: false,
              photoType: 'detail',
              damageType: 'Photo captured',
              severity: 'none',
              location: 'Roof area',
              description: response.substring(0, 300) || 'Photo documented for inspection records',
              recommendations: [],
              insuranceRelevant: false,
              urgency: 'none'
            };
          }
        } catch {
          // Parse error fallback - assume no damage
          analysis = {
            damageDetected: false,
            photoType: 'detail',
            damageType: 'Photo captured',
            severity: 'none',
            location: 'Roof area',
            description: 'Photo documented for inspection records',
            recommendations: [],
            insuranceRelevant: false,
            urgency: 'none'
          };
        }

        // Update photo with analysis
        setPhotos(prev => prev.map(p =>
          p.id === photo.id
            ? { ...p, status: 'complete', analysis, base64: base64Full }
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
  }, [photos.length]);

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return prev.filter(p => p.id !== id);
    });
  };

  // ============================================================================
  // ADDRESS PARSING HELPER
  // ============================================================================

  const parseAddress = (fullAddress: string): { address: string; city: string; state: string; zip?: string } => {
    // Default values
    const result = {
      address: fullAddress || 'Address pending',
      city: '',
      state: 'VA' as 'VA' | 'MD' | 'PA',
      zip: undefined as string | undefined
    };

    if (!fullAddress || fullAddress.trim() === '') {
      return result;
    }

    try {
      // Parse formats like:
      // "123 Main St, Baltimore, MD 21201"
      // "123 Main Street, Springfield, VA 22150"
      // "456 Oak Ave, Richmond VA 23220"

      const parts = fullAddress.split(',').map(p => p.trim());

      if (parts.length >= 3) {
        // Format: "street, city, state zip"
        result.address = parts[0];
        result.city = parts[1];

        // Parse "state zip" or "state" from last part
        const stateZipPart = parts[2];
        const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5})?$/i);

        if (stateZipMatch) {
          const stateCode = stateZipMatch[1].toUpperCase();
          if (stateCode === 'VA' || stateCode === 'MD' || stateCode === 'PA') {
            result.state = stateCode as 'VA' | 'MD' | 'PA';
          }
          if (stateZipMatch[2]) {
            result.zip = stateZipMatch[2];
          }
        }
      } else if (parts.length === 2) {
        // Format: "street, city state zip"
        result.address = parts[0];

        // Try to parse "city state zip"
        const cityStateZipMatch = parts[1].match(/^(.+?)\s+([A-Z]{2})\s*(\d{5})?$/i);
        if (cityStateZipMatch) {
          result.city = cityStateZipMatch[1].trim();
          const stateCode = cityStateZipMatch[2].toUpperCase();
          if (stateCode === 'VA' || stateCode === 'MD' || stateCode === 'PA') {
            result.state = stateCode as 'VA' | 'MD' | 'PA';
          }
          if (cityStateZipMatch[3]) {
            result.zip = cityStateZipMatch[3];
          }
        } else {
          result.city = parts[1];
        }
      } else {
        // Single part - just use as street address
        result.address = fullAddress;
      }
    } catch (error) {
      console.error('Error parsing address:', error);
      // Return original address if parsing fails
      result.address = fullAddress;
    }

    return result;
  };

  // ============================================================================
  // PRESENTATION & JOB GENERATION
  // ============================================================================

  const generatePresentation = async () => {
    if (completedCount === 0) return;

    setIsGenerating(true);
    const completedPhotos = photos.filter(p => p.status === 'complete');

    try {
      const user = authService.getCurrentUser();
      const userEmail = user?.email || 'unknown';

      const hasCriticalDamage = completedPhotos.some(
        p => p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe'
      );

      const parsedAddress = parseAddress(homeownerInfo.address);

      // STEP 1: Create Inspection and Save Photos to Database
      setGenerationStatus('Saving inspection and photos to database...');
      const { inspectionId, photoIds } = await createInspectionWithPhotos(
        userEmail,
        homeownerInfo,
        completedPhotos.map(p => ({
          id: p.id,
          file: p.file,
          preview: p.preview,
          base64: p.base64,
          status: p.status,
          analysis: p.analysis
        }))
      );

      console.log('[Inspection] Saved to database:', { inspectionId, photoCount: photoIds.length });

      // STEP 2: Create Job
      setGenerationStatus('Creating job record...');
      const jobData: Partial<Job> = {
        title: `Roof Inspection - ${parsedAddress.address || 'New Property'}`,
        status: 'inspection_complete',
        priority: hasCriticalDamage ? 'urgent' : 'medium',
        leadSource: 'canvassing',
        customer: {
          name: homeownerInfo.name || 'Homeowner',
          phone: homeownerInfo.phone || undefined
        },
        property: {
          address: parsedAddress.address,
          city: parsedAddress.city,
          state: parsedAddress.state,
          zip: parsedAddress.zip
        },
        notes: [],
        attachments: [],
        actions: []
      };

      const job = await jobService.createJob(userEmail, jobData);

      // STEP 3: Link Inspection to Job
      await fetch(`/api/inspections/${inspectionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({
          job_id: job.id,
          status: 'completed'
        })
      });

      // STEP 4: Generate AI Summary Note
      setGenerationStatus('Generating AI summary...');
      const summaryText = generateAISummary(completedPhotos, parsedAddress);

      const summaryNote: JobNote = {
        id: `note-${Date.now()}`,
        text: summaryText,
        createdAt: new Date().toISOString(),
        author: 'Susan AI',
        type: 'inspection'
      };

      await jobService.updateJob(job.id, {
        notes: [summaryNote, ...(job.notes || [])]
      });

      // STEP 5: Build Slides
      setGenerationStatus('Building presentation slides...');
      const slides: PresentationSlide[] = [];
      let order = 0;

      if (userProfile) {
        slides.push({
          id: `slide-rep-${Date.now()}`,
          type: 'rep_profile',
          title: 'Your Roofing Professional',
          content: JSON.stringify(userProfile),
          order: order++
        });
      }

      slides.push({
        id: `slide-cover-${Date.now()}`,
        type: 'cover',
        title: 'Roof Inspection Report',
        content: homeownerInfo.address || 'Property Inspection',
        order: order++
      });

      // Photo Slides - WITH DATABASE PHOTO IDs
      // Handle photos WITH damage vs photos WITHOUT damage differently
      for (let i = 0; i < completedPhotos.length; i++) {
        const photo = completedPhotos[i];
        const photoId = photoIds[i];
        const hasDamage = photo.analysis?.damageDetected !== false &&
                          photo.analysis?.severity !== 'none';

        slides.push({
          id: `slide-photo-${photoId || photo.id}`,
          type: 'photo',
          // If no damage, use neutral title
          title: hasDamage
            ? (photo.analysis?.damageType || 'Inspection Finding')
            : 'Property Photo',
          photo: photo.preview,
          photoBase64: photo.base64,
          photoId: photoId, // DATABASE PHOTO ID for persistence
          // Only include analysis if damage was detected
          analysis: hasDamage ? photo.analysis : undefined,
          // Add content for context if no damage
          content: !hasDamage ? photo.analysis?.description : undefined,
          order: order++
        });
      }

      // Count actual damage photos
      const actualDamageCount = completedPhotos.filter(p => p.analysis?.damageDetected === true).length;

      slides.push({
        id: `slide-summary-${Date.now()}`,
        type: 'summary',
        title: 'Storm Damage Assessment',
        content: JSON.stringify({
          totalPhotos: completedPhotos.length,
          damagePoints: actualDamageCount,
          criticalIssues: criticalCount,
          insuranceRelevant: insuranceCount,
          // Based on training: Always acknowledge storm, explain why damage matters
          overallAssessment: hasCriticalDamage
            ? 'Significant storm damage documented. Your insurance policy covers this type of damage.'
            : actualDamageCount > 0
              ? 'Storm damage documented. Even minor damage can lead to leaks over time as water seeps in and expands.'
              : 'After the recent storm in your area, we documented your roof condition. Your insurance company should assess this damage.'
        }),
        order: order++
      });

      // Only include recommendations from photos WITH damage
      const allRecommendations = completedPhotos
        .filter(p => p.analysis?.damageDetected === true)
        .flatMap(p => p.analysis?.recommendations || [])
        .filter((rec, idx, arr) => arr.indexOf(rec) === idx)
        .slice(0, 5);

      if (allRecommendations.length > 0) {
        slides.push({
          id: `slide-recs-${Date.now()}`,
          type: 'recommendations',
          title: 'Recommended Next Steps',
          content: JSON.stringify(allRecommendations),
          order: order++
        });
      }

      // CTA - Based on training script: Position as storm experts ensuring fair treatment
      slides.push({
        id: `slide-cta-${Date.now()}`,
        type: 'cta',
        title: "Let's Get Your Claim Filed",
        content: JSON.stringify({
          // From training: "insurance companies are always looking for ways to mitigate their losses"
          // "we are here as storm experts to make sure you as a homeowner get a fair shake"
          headline: "Your Insurance Policy Covers This Damage",
          message: actualDamageCount > 0
            ? `We documented ${actualDamageCount} area${actualDamageCount !== 1 ? 's' : ''} of storm damage. Insurance companies are always looking to mitigate their losses - that's how they make money. As storm damage experts, we're here to make sure you get a fair shake.`
            : 'After the recent storm in your area, your insurance company should assess your roof. As storm damage experts, we ensure you get a fair evaluation - not all damage is visible to the untrained eye.',
          nextSteps: [
            'We handle all communication with your insurance company',
            'We ensure they see all the damage - nothing gets missed',
            'No out-of-pocket cost unless your claim is approved'
          ],
          callToAction: "Let's get this process started",
          showAgreement: true
        }),
        order: order++
      });

      // AGREEMENT SLIDES - ALWAYS show (business goal is to get signatures)
      // Claim Authorization Form
      slides.push({
        id: `slide-claim-auth-${Date.now()}`,
        type: 'claim_authorization',
        title: 'Claim Authorization Form',
        content: 'Authorization to communicate with insurance company',
        order: order++
      });

      // Contingency Agreement
      slides.push({
        id: `slide-contingency-${Date.now()}`,
        type: 'contingency',
        title: 'Insurance Claim Agreement',
          content: 'Contingency agreement for insurance claim work',
          order: order++
        });

      // Thank You / Completion
      slides.push({
        id: `slide-thank-you-${Date.now()}`,
        type: 'thank_you',
        title: "You're All Set!",
        content: 'Agreement signed, next steps coming',
        order: order++
      });

      // STEP 6: Save Presentation to Database
      setGenerationStatus('Saving presentation...');
      const { presentationId } = await createPresentation(
        userEmail,
        inspectionId,
        slides,
        homeownerInfo
      );

      console.log('[Presentation] Created:', { presentationId, inspectionId, jobId: job.id });

      setGenerationStatus('Ready to present!');

      if (onPresentationReady) {
        onPresentationReady(slides, job.id);
      }

    } catch (error: any) {
      console.error('Error generating presentation:', error);
      setGenerationStatus(`Error: ${error.message || 'Failed to generate presentation'}`);
      alert(`Error: ${error.message || 'Failed to generate presentation'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAISummary = (analyzedPhotos: UploadedPhoto[], parsedAddress: { address: string; city: string; state: string; zip?: string }): string => {
    // Only count photos with ACTUAL damage
    const damagePhotos = analyzedPhotos.filter(p => p.analysis?.damageDetected === true);
    const criticals = damagePhotos.filter(p =>
      p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe'
    );
    const insuranceItems = damagePhotos.filter(p => p.analysis?.insuranceRelevant);

    const fullAddress = [
      parsedAddress.address,
      parsedAddress.city,
      parsedAddress.state,
      parsedAddress.zip
    ].filter(Boolean).join(', ');

    let summary = `## Roof Inspection Summary\n\n`;
    summary += `**Date:** ${new Date().toLocaleDateString()}\n`;
    summary += `**Property:** ${fullAddress || 'Address pending'}\n`;
    summary += `**Homeowner:** ${homeownerInfo.name || 'Not provided'}\n\n`;

    summary += `### Key Findings\n`;
    summary += `- **Total Photos:** ${analyzedPhotos.length}\n`;
    summary += `- **Damage Points Found:** ${damagePhotos.length}\n`;
    summary += `- **Critical/Severe Issues:** ${criticals.length}\n`;
    summary += `- **Insurance-Relevant Items:** ${insuranceItems.length}\n\n`;

    if (damagePhotos.length === 0) {
      summary += `### Assessment\n`;
      summary += `No significant storm damage was detected during this inspection. `;
      summary += `The roof appears to be in satisfactory condition based on the photos documented.\n\n`;
    } else {
      if (criticals.length > 0) {
        summary += `### Damage Requiring Attention\n`;
        criticals.forEach((p, i) => {
          summary += `${i + 1}. **${p.analysis?.damageType}** (${p.analysis?.location})\n`;
          summary += `   - ${p.analysis?.description}\n`;
        });
        summary += '\n';
      }

      if (insuranceItems.length > 0) {
        summary += `### Insurance Claim Recommendation\n`;
        summary += `Based on the documented damage, this property has ${insuranceItems.length} item${insuranceItems.length !== 1 ? 's' : ''} that may qualify for insurance coverage. `;
        summary += `We recommend filing a claim to protect the homeowner's investment.\n\n`;
      }
    }

    summary += `### Next Steps\n`;
    if (insuranceItems.length > 0) {
      summary += `1. Sign Claim Authorization Form\n`;
      summary += `2. Sign Insurance Claim Agreement\n`;
      summary += `3. We'll file the claim and handle all insurance communication\n`;
    } else {
      summary += `1. Keep this inspection report for your records\n`;
      summary += `2. Schedule annual roof inspections\n`;
      summary += `3. Contact us if you notice any new damage\n`;
    }

    return summary;
  };

  // ============================================================================
  // DRAG & DROP HANDLERS
  // ============================================================================

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // ============================================================================
  // SEVERITY STYLING
  // ============================================================================

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: '#DC2626', color: 'white' };
      case 'severe': return { bg: '#EA580C', color: 'white' };
      case 'moderate': return { bg: '#D97706', color: 'white' };
      case 'minor': return { bg: '#16A34A', color: 'white' };
      default: return { bg: '#64748B', color: 'white' };
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 50%, #F1F5F9 100%)',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '32px'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px -8px rgba(196, 30, 58, 0.5)'
          }}>
            <Camera style={{ width: '28px', height: '28px', color: 'white' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#0F172A',
              margin: 0,
              letterSpacing: '-0.02em'
            }}>
              New Inspection
            </h1>
            <p style={{ fontSize: '15px', color: '#64748B', margin: '4px 0 0 0' }}>
              Upload photos and generate a professional presentation
            </p>
          </div>
        </div>

        {/* Stats Bar */}
        {photos.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {[
              { icon: <Camera size={20} />, value: photos.length, label: 'Photos', color: '#c41e3a' },
              { icon: <Sparkles size={20} />, value: completedCount, label: 'Analyzed', color: '#4b5563' },
              { icon: <Shield size={20} />, value: insuranceCount, label: 'Insurance', color: '#22C55E' },
              { icon: <AlertTriangle size={20} />, value: criticalCount, label: 'Critical', color: '#F97316' }
            ].map((stat, i) => (
              <div key={i} style={{
                background: 'white',
                borderRadius: '14px',
                padding: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 8px -2px rgba(0,0,0,0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: `${stat.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: stat.color
                  }}>
                    {stat.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: '22px', fontWeight: '700', color: '#0F172A', margin: 0 }}>
                      {stat.value}
                    </p>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Homeowner Info Card */}
        <div style={{
          background: 'white',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 24px -4px rgba(0,0,0,0.08)',
          marginBottom: '20px',
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setShowHomeownerForm(!showHomeownerForm)}
            style={{
              width: '100%',
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: showHomeownerForm ? '#F8FAFC' : 'white',
              border: 'none',
              cursor: 'pointer',
              borderBottom: showHomeownerForm ? '1px solid #E2E8F0' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4b5563 0%, #1f2937 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Home size={20} color="white" />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontWeight: '600', fontSize: '15px', color: '#0F172A', margin: 0 }}>
                  Homeowner Information
                </p>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0 0' }}>
                  {homeownerInfo.name || homeownerInfo.address
                    ? `${homeownerInfo.name}${homeownerInfo.name && homeownerInfo.address ? ' • ' : ''}${homeownerInfo.address}`
                    : 'Optional - Add contact details'}
                </p>
              </div>
            </div>
            {showHomeownerForm ? <ChevronUp size={20} color="#64748B" /> : <ChevronDown size={20} color="#64748B" />}
          </button>

          {showHomeownerForm && (
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Name */}
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#475569',
                    marginBottom: '8px'
                  }}>
                    <User size={14} />
                    Homeowner Name
                  </label>
                  <input
                    type="text"
                    placeholder="John Smith"
                    value={homeownerInfo.name}
                    onChange={(e) => setHomeownerInfo({ ...homeownerInfo, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#c41e3a';
                      e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E2E8F0';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#475569',
                    marginBottom: '8px'
                  }}>
                    <Phone size={14} />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={homeownerInfo.phone}
                    onChange={(e) => setHomeownerInfo({ ...homeownerInfo, phone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      fontSize: '15px',
                      outline: 'none'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#c41e3a';
                      e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E2E8F0';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Address - full width */}
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#475569',
                  marginBottom: '8px'
                }}>
                  <MapPin size={14} />
                  Property Address
                </label>
                <input
                  type="text"
                  placeholder="123 Main Street, Springfield, VA 22150"
                  value={homeownerInfo.address}
                  onChange={(e) => setHomeownerInfo({ ...homeownerInfo, address: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#c41e3a';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E2E8F0';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Photo Upload Card */}
        <div style={{
          background: 'white',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 24px -4px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: '600', color: '#0F172A', margin: 0 }}>
                Inspection Photos
              </h2>
              <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>
                Upload 10-20 roof photos for AI analysis
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: '#EFF6FF',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500',
                color: '#c41e3a'
              }}>
                <Sparkles size={14} /> AI Powered
              </span>
            </div>
          </div>

          <div style={{ padding: '24px' }}>
            {/* Drop Zone */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                borderRadius: '16px',
                border: isDragging ? '2px dashed #c41e3a' : '2px dashed #CBD5E1',
                padding: '40px',
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

              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 16px',
                borderRadius: '16px',
                background: isDragging
                  ? 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)'
                  : 'linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isDragging ? '0 8px 24px -8px rgba(59,130,246,0.5)' : 'none'
              }}>
                <CloudUpload size={28} color={isDragging ? 'white' : '#64748B'} />
              </div>

              <p style={{ fontSize: '16px', fontWeight: '600', color: '#1E293B', margin: 0 }}>
                {isDragging ? 'Drop photos here' : 'Drop photos or click to browse'}
              </p>
              <p style={{ fontSize: '14px', color: '#64748B', margin: '6px 0 0 0' }}>
                JPG, PNG, HEIC up to 10MB • Max {maxPhotos} photos
              </p>
            </div>

            {/* Progress Bar */}
            {photos.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  marginBottom: '8px'
                }}>
                  <span style={{ color: '#475569', fontWeight: '500' }}>
                    {analyzingCount > 0
                      ? `Analyzing ${analyzingCount} photo${analyzingCount !== 1 ? 's' : ''}...`
                      : `${completedCount} of ${photos.length} analyzed`}
                  </span>
                  <span style={{ color: '#475569', fontWeight: '600' }}>{Math.round(progress)}%</span>
                </div>
                <div style={{
                  height: '8px',
                  background: '#E2E8F0',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #c41e3a 0%, #4b5563 100%)',
                    borderRadius: '8px',
                    width: `${progress}%`,
                    transition: 'width 0.5s ease-out'
                  }} />
                </div>
              </div>
            )}

            {/* Photo Grid */}
            {photos.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '12px',
                marginTop: '24px'
              }}>
                {photos.map(photo => {
                  const severityStyle = photo.analysis ? getSeverityStyle(photo.analysis.severity) : null;

                  return (
                    <div
                      key={photo.id}
                      style={{
                        position: 'relative',
                        aspectRatio: '1',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#F1F5F9',
                        border: '1px solid #E2E8F0'
                      }}
                    >
                      <img
                        src={photo.preview}
                        alt="Inspection"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />

                      {/* Status Overlay */}
                      {photo.status !== 'complete' && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(255,255,255,0.9)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {photo.status === 'analyzing' && (
                            <div style={{ textAlign: 'center' }}>
                              <Sparkles size={24} color="#4b5563" style={{ animation: 'pulse 1.5s infinite' }} />
                              <p style={{ fontSize: '11px', color: '#64748B', margin: '8px 0 0 0' }}>Analyzing</p>
                            </div>
                          )}
                          {photo.status === 'uploading' && <Loader2 size={24} color="#94A3B8" style={{ animation: 'spin 1s linear infinite' }} />}
                          {photo.status === 'error' && <AlertCircle size={24} color="#EF4444" />}
                        </div>
                      )}

                      {/* Complete Badge */}
                      {photo.status === 'complete' && (
                        <div style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: '#22C55E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <CheckCircle2 size={14} color="white" />
                        </div>
                      )}

                      {/* Remove Button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.6)',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X size={12} color="white" />
                      </button>

                      {/* Severity Badge */}
                      {photo.analysis && severityStyle && (
                        <div style={{
                          position: 'absolute',
                          bottom: '6px',
                          left: '6px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: severityStyle.bg,
                          color: severityStyle.color,
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
          </div>
        </div>

        {/* Generate Button */}
        {completedCount > 0 && (
          <div style={{
            marginTop: '24px',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <Button
              onClick={generatePresentation}
              disabled={isGenerating || completedCount === 0}
              style={{
                background: isGenerating
                  ? '#94A3B8'
                  : 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                padding: '16px 40px',
                fontSize: '16px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: isGenerating ? 'wait' : 'pointer',
                boxShadow: '0 8px 24px -8px rgba(59,130,246,0.5)',
                transition: 'all 0.2s ease'
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  {generationStatus}
                </>
              ) : (
                <>
                  <Play size={20} />
                  Generate Presentation
                  <ArrowRight size={20} />
                </>
              )}
            </Button>
          </div>
        )}

        {/* CSS Keyframes */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    </div>
  );
};

export default NewInspectionFlow;
