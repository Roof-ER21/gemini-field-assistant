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

interface NewInspectionFlowProps {
  onPresentationReady?: (slides: PresentationSlide[], jobId: string) => void;
  userProfile?: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    photoUrl?: string;
    credentials?: string[];
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
  const criticalCount = photos.filter(p =>
    p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe'
  ).length;
  const insuranceCount = photos.filter(p => p.analysis?.insuranceRelevant).length;

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

        // AI Analysis prompt - persuasive insurance-focused
        const prompt = `You are a professional roof inspector helping homeowners understand damage that may qualify for insurance claims. Analyze this roof inspection photo and provide detailed findings.

IMPORTANT: Be thorough but fair. If you see damage, explain it clearly and note its insurance relevance. Focus on protecting the homeowner's investment.

Provide your analysis in this JSON format:
{
  "damageType": "type of damage (e.g., 'Hail Impact Damage', 'Wind-Lifted Shingles', 'Storm Damage', 'Wear Pattern')",
  "severity": "minor|moderate|severe|critical",
  "location": "location on roof (e.g., 'North-facing slope', 'Ridge line', 'Valley')",
  "description": "detailed description focusing on what this means for the homeowner and their insurance claim",
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "insuranceRelevant": true/false,
  "estimatedRepairCost": "cost range (e.g., '$500-$1,000')",
  "urgency": "low|medium|high|critical"
}

Focus on:
1. Insurance-relevant damage patterns (hail, wind, storm)
2. Safety concerns for the homeowner
3. Why timely action protects their investment
4. Clear, non-technical language homeowners understand`;

        const response = await analyzeImage(base64Data, photo.file.type, prompt);

        // Parse response
        let analysis: PhotoAnalysis;
        try {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          } else {
            analysis = {
              damageType: 'Damage detected',
              severity: 'moderate',
              location: 'Roof area',
              description: response.substring(0, 300),
              recommendations: ['Professional inspection recommended'],
              insuranceRelevant: true,
              urgency: 'medium'
            };
          }
        } catch {
          analysis = {
            damageType: 'Analysis available',
            severity: 'moderate',
            location: 'See details',
            description: response.substring(0, 300),
            recommendations: ['Review with inspector'],
            insuranceRelevant: true,
            urgency: 'medium'
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
  // PRESENTATION & JOB GENERATION
  // ============================================================================

  const generatePresentation = async () => {
    if (completedCount === 0) return;

    setIsGenerating(true);
    const completedPhotos = photos.filter(p => p.status === 'complete');

    try {
      // Step 1: Create Job
      setGenerationStatus('Creating job record...');
      const user = authService.getCurrentUser();
      const userId = user?.email || 'unknown';

      const hasCriticalDamage = completedPhotos.some(
        p => p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe'
      );

      const jobData: Partial<Job> = {
        title: `Roof Inspection - ${homeownerInfo.address || 'New Property'}`,
        status: 'inspection_complete',
        priority: hasCriticalDamage ? 'urgent' : 'medium',
        leadSource: 'canvassing',
        customer: {
          name: homeownerInfo.name || 'Homeowner',
          phone: homeownerInfo.phone || undefined
        },
        property: {
          address: homeownerInfo.address || 'Address pending',
          city: '',
          state: 'VA'
        },
        notes: [],
        attachments: [],
        actions: []
      };

      const job = await jobService.createJob(userId, jobData);

      // Step 2: Generate AI Summary Note
      setGenerationStatus('Generating AI summary...');
      const summaryText = generateAISummary(completedPhotos);

      const summaryNote: JobNote = {
        id: `note-${Date.now()}`,
        text: summaryText,
        createdAt: new Date().toISOString(),
        author: 'Susan AI',
        type: 'inspection'
      };

      // Add note to job
      await jobService.updateJob(job.id, {
        notes: [summaryNote, ...(job.notes || [])]
      });

      // Step 3: Build Slides
      setGenerationStatus('Building presentation slides...');
      const slides: PresentationSlide[] = [];
      let order = 0;

      // Rep Profile Slide (first)
      if (userProfile) {
        slides.push({
          id: `slide-rep-${Date.now()}`,
          type: 'rep_profile',
          title: 'Your Roofing Professional',
          content: JSON.stringify(userProfile),
          order: order++
        });
      }

      // Cover Slide
      slides.push({
        id: `slide-cover-${Date.now()}`,
        type: 'cover',
        title: 'Roof Inspection Report',
        content: homeownerInfo.address || 'Property Inspection',
        order: order++
      });

      // Photo Slides
      for (const photo of completedPhotos) {
        slides.push({
          id: `slide-photo-${photo.id}`,
          type: 'photo',
          title: photo.analysis?.damageType || 'Inspection Finding',
          photo: photo.preview,
          photoBase64: photo.base64,
          analysis: photo.analysis,
          order: order++
        });
      }

      // Summary Slide
      slides.push({
        id: `slide-summary-${Date.now()}`,
        type: 'summary',
        title: 'Inspection Summary',
        content: JSON.stringify({
          totalFindings: completedPhotos.length,
          criticalIssues: criticalCount,
          insuranceRelevant: insuranceCount,
          overallAssessment: hasCriticalDamage ? 'Immediate attention recommended' : 'Standard maintenance items found'
        }),
        order: order++
      });

      // Recommendations Slide
      const allRecommendations = completedPhotos
        .flatMap(p => p.analysis?.recommendations || [])
        .filter((rec, idx, arr) => arr.indexOf(rec) === idx)
        .slice(0, 5);

      slides.push({
        id: `slide-recs-${Date.now()}`,
        type: 'recommendations',
        title: 'Recommended Next Steps',
        content: JSON.stringify(allRecommendations),
        order: order++
      });

      // Call-to-Action Slide
      slides.push({
        id: `slide-cta-${Date.now()}`,
        type: 'cta',
        title: 'Protect Your Home',
        content: JSON.stringify({
          message: insuranceCount > 0
            ? `We found ${insuranceCount} insurance-relevant items. Let's file a claim to protect your investment.`
            : 'Schedule a full inspection to ensure your roof is protected.',
          nextSteps: [
            'Schedule comprehensive inspection',
            'Review insurance coverage',
            'Get free estimate'
          ]
        }),
        order: order++
      });

      setGenerationStatus('Ready to present!');

      // Callback with slides and job ID
      if (onPresentationReady) {
        onPresentationReady(slides, job.id);
      }

    } catch (error) {
      console.error('Error generating presentation:', error);
      setGenerationStatus('Error generating presentation');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAISummary = (analyzedPhotos: UploadedPhoto[]): string => {
    const criticals = analyzedPhotos.filter(p =>
      p.analysis?.severity === 'critical' || p.analysis?.severity === 'severe'
    );
    const insuranceItems = analyzedPhotos.filter(p => p.analysis?.insuranceRelevant);

    let summary = `## Roof Inspection Summary\n\n`;
    summary += `**Date:** ${new Date().toLocaleDateString()}\n`;
    summary += `**Property:** ${homeownerInfo.address || 'Address pending'}\n`;
    summary += `**Homeowner:** ${homeownerInfo.name || 'Not provided'}\n\n`;

    summary += `### Key Findings\n`;
    summary += `- **Total Items Documented:** ${analyzedPhotos.length}\n`;
    summary += `- **Critical/Severe Issues:** ${criticals.length}\n`;
    summary += `- **Insurance-Relevant Items:** ${insuranceItems.length}\n\n`;

    if (criticals.length > 0) {
      summary += `### Critical Issues Requiring Immediate Attention\n`;
      criticals.forEach((p, i) => {
        summary += `${i + 1}. **${p.analysis?.damageType}** (${p.analysis?.location})\n`;
        summary += `   - ${p.analysis?.description}\n`;
      });
      summary += '\n';
    }

    if (insuranceItems.length > 0) {
      summary += `### Insurance Claim Recommendation\n`;
      summary += `Based on the documented damage, this property appears to have ${insuranceItems.length} items that may qualify for insurance coverage. `;
      summary += `Recommend filing a claim promptly to protect the homeowner's investment.\n\n`;
    }

    summary += `### Next Steps\n`;
    summary += `1. Schedule full roof inspection\n`;
    summary += `2. Contact insurance company to file claim\n`;
    summary += `3. Obtain repair estimates\n`;

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
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 50%, #F1F5F9 100%)',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

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
            background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px -8px rgba(59, 130, 246, 0.5)'
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
              { icon: <Camera size={20} />, value: photos.length, label: 'Photos', color: '#3B82F6' },
              { icon: <Sparkles size={20} />, value: completedCount, label: 'Analyzed', color: '#8B5CF6' },
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
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
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
                      e.target.style.borderColor = '#3B82F6';
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
                      e.target.style.borderColor = '#3B82F6';
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
                    e.target.style.borderColor = '#3B82F6';
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
                color: '#3B82F6'
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
                border: isDragging ? '2px dashed #3B82F6' : '2px dashed #CBD5E1',
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
                  ? 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)'
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
                    background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
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
                              <Sparkles size={24} color="#8B5CF6" style={{ animation: 'pulse 1.5s infinite' }} />
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
                  : 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
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
