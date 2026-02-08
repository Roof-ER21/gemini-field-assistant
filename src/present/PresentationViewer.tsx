/**
 * Public Presentation Viewer
 * View-only presentation page accessible without login at /present/:token
 * Uses InspectionPresenterV2 for modern, full-featured presentation
 */

import React, { useState, useEffect } from 'react';
import { X, Home } from 'lucide-react';
import { InspectionPresenterV2 } from '../../components/inspection/InspectionPresenterV2';

const API_BASE = '';

// Types for API
interface APISlide {
  id: string;
  slide_number: number;
  slide_type: 'cover' | 'photo' | 'analysis' | 'summary' | 'recommendations' | 'contact';
  title: string;
  content: string;
  photo_id?: string;
  photo_url?: string;
  ai_insights?: {
    damageDetected?: boolean;
    damageType?: string[];
    severity?: string;
    affectedArea?: string;
    estimatedSize?: string;
    claimViability?: string;
    policyLanguage?: string;
    insuranceArguments?: string[];
    recommendations?: string[];
    followUpQuestions?: string[];
    urgency?: string;
    confidence?: number;
    detailedAnalysis?: string;
  };
  layout: 'full-image' | 'split' | 'grid' | 'text-only';
}

interface Presentation {
  id: string;
  inspection_id: string;
  user_id: string;
  title: string;
  customer_name: string;
  property_address: string;
  presentation_type: 'standard' | 'insurance' | 'detailed';
  slides: APISlide[];
  branding?: {
    logo_url?: string;
    company_name?: string;
    contact_info?: string;
  };
  share_token?: string;
  is_public: boolean;
  view_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// Types for InspectionPresenterV2
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

const PresentationViewer: React.FC = () => {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convertedSlides, setConvertedSlides] = useState<PresentationSlide[]>([]);

  // Extract token from URL
  const token = window.location.pathname.split('/present/')[1]?.split('/')[0] || '';

  useEffect(() => {
    if (!token) {
      setError('Invalid presentation link');
      setLoading(false);
      return;
    }
    fetchPresentation();
  }, [token]);

  const fetchPresentation = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/present/${token}`);
      const data = await response.json();

      if (response.ok && data.presentation) {
        setPresentation(data.presentation);

        // Convert API slides to InspectionPresenterV2 format
        const converted = convertSlidesToPresenterFormat(data.presentation.slides);
        setConvertedSlides(converted);

        // Track viewer session
        trackViewerSession();
      } else {
        setError(data.error || 'Presentation not found or no longer available');
      }
    } catch (err) {
      console.error('Failed to load presentation:', err);
      setError('Failed to load presentation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const trackViewerSession = async () => {
    try {
      // Track analytics for viewer session
      await fetch(`${API_BASE}/api/present/${token}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          referrer: document.referrer || 'direct',
          userAgent: navigator.userAgent,
        })
      });
    } catch (err) {
      // Silent fail - analytics shouldn't block presentation
      console.debug('Analytics tracking failed:', err);
    }
  };

  // Convert API slides to InspectionPresenterV2 format
  const convertSlidesToPresenterFormat = (apiSlides: APISlide[]): PresentationSlide[] => {
    return apiSlides.map((slide, index) => {
      // Map slide types
      let type: 'cover' | 'rep_profile' | 'photo' | 'summary' | 'recommendations' | 'cta';
      switch (slide.slide_type) {
        case 'cover':
          type = 'cover';
          break;
        case 'photo':
        case 'analysis':
          type = 'photo';
          break;
        case 'summary':
          type = 'summary';
          break;
        case 'recommendations':
          type = 'recommendations';
          break;
        case 'contact':
          type = 'cta';
          break;
        default:
          type = 'photo';
      }

      // Convert AI insights to PhotoAnalysis if it's a photo slide
      let analysis: PhotoAnalysis | undefined;
      if (slide.ai_insights && slide.ai_insights.damageDetected) {
        const insights = slide.ai_insights;
        analysis = {
          damageType: insights.damageType?.join(', ') || 'Unknown',
          severity: (insights.severity as 'minor' | 'moderate' | 'severe' | 'critical') || 'moderate',
          location: insights.affectedArea || 'Not specified',
          description: insights.detailedAnalysis || slide.content || '',
          recommendations: insights.recommendations || [],
          insuranceRelevant: insights.claimViability !== 'none',
          estimatedRepairCost: insights.estimatedSize,
          urgency: mapUrgency(insights.urgency || insights.severity)
        };
      }

      return {
        id: slide.id,
        type,
        title: slide.title,
        content: slide.content,
        photo: slide.photo_url,
        photoBase64: slide.photo_url,
        analysis,
        order: index
      };
    });
  };

  const mapUrgency = (urgency?: string): 'low' | 'medium' | 'high' | 'critical' => {
    switch (urgency?.toLowerCase()) {
      case 'urgent':
      case 'critical':
        return 'critical';
      case 'high':
      case 'severe':
        return 'high';
      case 'medium':
      case 'moderate':
        return 'medium';
      default:
        return 'low';
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-red mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading presentation...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !presentation) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Presentation Not Found</h1>
          <p className="text-gray-400 mb-6">
            {error || 'The presentation you\'re looking for doesn\'t exist or is no longer available.'}
          </p>
          <a
            href="https://theroofdocs.com"
            className="inline-flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            <Home className="w-5 h-5" />
            Visit The Roof Docs
          </a>
        </div>
      </div>
    );
  }

  // Main Presentation View - Using InspectionPresenterV2
  return (
    <InspectionPresenterV2
      slides={convertedSlides}
      jobId={presentation.inspection_id}
      propertyAddress={presentation.property_address}
      homeownerName={presentation.customer_name}
      userProfile={
        presentation.branding
          ? {
              name: presentation.branding.company_name || 'The Roof Docs',
              email: '',
              company: presentation.branding.company_name,
              phone: presentation.branding.contact_info,
              photoUrl: presentation.branding.logo_url,
            }
          : undefined
      }
      onClose={undefined} // No close button in public view
      onShare={undefined} // No share button in public view (already shared)
    />
  );
};

export default PresentationViewer;
