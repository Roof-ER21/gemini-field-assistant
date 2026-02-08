# Implementation Guide: Inspection Presentations

## Quick Start for Developers

This guide provides practical examples for implementing the Inspection Presentations feature in the Gemini Field Assistant application.

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [TypeScript Types](#typescript-types)
3. [Database Queries](#database-queries)
4. [Frontend Components](#frontend-components)
5. [AI Integration](#ai-integration)
6. [Share URL System](#share-url-system)
7. [Analytics Tracking](#analytics-tracking)
8. [Testing](#testing)

---

## API Endpoints

### Recommended REST API Structure

```typescript
// routes/api/inspections.ts

// GET /api/inspections - List all inspections
// GET /api/inspections/:id - Get inspection with photos
// POST /api/inspections - Create new inspection
// PATCH /api/inspections/:id - Update inspection
// DELETE /api/inspections/:id - Delete inspection

// POST /api/inspections/:id/photos - Upload photo
// DELETE /api/inspections/:id/photos/:photoId - Delete photo
// PATCH /api/inspections/:id/photos/:photoId - Update photo caption/order

// POST /api/inspections/:id/complete - Mark inspection complete
// POST /api/inspections/:id/generate-presentation - Create presentation

// GET /api/presentations - List presentations
// GET /api/presentations/:id - Get presentation details
// PATCH /api/presentations/:id - Update presentation
// POST /api/presentations/:id/share - Share presentation
// GET /api/presentations/:id/analytics - Get analytics

// GET /api/present/:shareToken - Public presentation view (no auth)
// POST /api/present/:shareToken/view - Track view event
```

---

## TypeScript Types

### Core Types

```typescript
// types/inspection.ts

export enum InspectionStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum DamageCategory {
  HAIL_DAMAGE = 'hail_damage',
  WIND_DAMAGE = 'wind_damage',
  WEAR_AND_TEAR = 'wear_and_tear',
  LEAK = 'leak',
  MISSING_SHINGLES = 'missing_shingles',
  FLASHING_DAMAGE = 'flashing_damage',
  GUTTER_DAMAGE = 'gutter_damage',
  SOFFIT_FASCIA = 'soffit_fascia',
  CHIMNEY = 'chimney',
  VENTILATION = 'ventilation',
  OTHER = 'other',
}

export enum DamageSeverity {
  MINOR = 'minor',
  MODERATE = 'moderate',
  SEVERE = 'severe',
  CRITICAL = 'critical',
}

export interface WeatherConditions {
  temperature: number;
  temperature_unit: 'F' | 'C';
  conditions: string;
  wind_speed: number;
  wind_direction?: string;
  precipitation: string;
  visibility: string;
}

export interface RoofMeasurements {
  total_sqft: number;
  ridges: Array<{ section: string; length_ft: number }>;
  valleys: Array<{ section: string; length_ft: number }>;
  eaves: Array<{ section: string; length_ft: number }>;
}

export interface Material {
  material: string;
  quantity: number;
  unit: string;
  color?: string;
  notes?: string;
}

export interface Inspection {
  id: string;
  job_id: string;
  user_id: string;
  property_address: string;
  property_city: string;
  property_state: string;
  property_zip?: string;
  property_type?: string;
  inspection_date: Date;
  inspector_name: string;
  inspection_status: InspectionStatus;
  weather_conditions?: WeatherConditions;
  roof_type?: string;
  roof_age?: number;
  roof_area_sqft?: number;
  roof_pitch?: string;
  roof_layers?: number;
  overall_condition?: string;
  damage_summary?: string;
  repair_urgency?: string;
  recommended_action?: string;
  estimated_cost?: number;
  estimated_cost_high?: number;
  insurance_claimable: boolean;
  claim_support_notes?: string;
  inspection_notes?: string;
  measurements?: RoofMeasurements;
  materials_needed?: Material[];
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface PhotoAnnotation {
  type: 'rectangle' | 'arrow' | 'circle' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  label: string;
  color: string;
  stroke_width?: number;
}

export interface InspectionPhoto {
  id: string;
  inspection_id: string;
  user_id: string;
  photo_url: string;
  photo_thumbnail_url?: string;
  photo_order: number;
  ai_analysis?: string;
  ai_provider?: string;
  ai_confidence?: number;
  damage_detected: boolean;
  damage_categories: DamageCategory[];
  damage_severity?: DamageSeverity;
  damage_description?: string;
  roof_section?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  annotations?: PhotoAnnotation[];
  caption?: string;
  file_size_bytes?: number;
  mime_type?: string;
  taken_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export enum PresentationStatus {
  DRAFT = 'draft',
  GENERATED = 'generated',
  SENT = 'sent',
  VIEWED = 'viewed',
  SIGNED = 'signed',
}

export interface PresentationSlide {
  id: number;
  type: 'cover' | 'property_details' | 'damage_photo' | 'recommendations' | 'contact' | 'custom';
  title?: string;
  subtitle?: string;
  content?: any;
  photo_id?: string;
  caption?: string;
  background_image?: string;
}

export interface FinancingOption {
  provider: string;
  name: string;
  term_months: number;
  apr: number;
  monthly_payment: number;
  deferred_interest: boolean;
}

export interface Presentation {
  id: string;
  inspection_id: string;
  job_id: string;
  user_id: string;
  title: string;
  presentation_status: PresentationStatus;
  slides: PresentationSlide[];
  slide_count: number;
  theme: string;
  company_logo_url?: string;
  brand_color?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  property_address: string;
  property_city?: string;
  property_state?: string;
  property_zip?: string;
  estimated_cost?: number;
  estimated_cost_high?: number;
  financing_options?: FinancingOption[];
  share_url?: string;
  share_token?: string;
  password_protected: boolean;
  expires_at?: Date;
  total_views: number;
  unique_viewers: number;
  last_viewed_at?: Date;
  average_view_duration?: number;
  pdf_url?: string;
  pdf_generated_at?: Date;
  created_at: Date;
  updated_at: Date;
  sent_at?: Date;
  signed_at?: Date;
}

export interface PresentationShare {
  id: string;
  presentation_id: string;
  user_id: string;
  recipient_name?: string;
  recipient_email: string;
  recipient_phone?: string;
  share_method: 'email' | 'sms' | 'link' | 'qr_code';
  share_message?: string;
  email_sent: boolean;
  email_sent_at?: Date;
  email_opened: boolean;
  email_opened_at?: Date;
  sms_sent: boolean;
  sms_sent_at?: Date;
  sms_message_sid?: string;
  first_viewed_at?: Date;
  last_viewed_at?: Date;
  view_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface PresentationView {
  id: string;
  presentation_id: string;
  presentation_share_id?: string;
  viewer_ip?: string;
  viewer_user_agent?: string;
  viewer_device?: string;
  viewer_browser?: string;
  viewer_os?: string;
  viewer_city?: string;
  viewer_state?: string;
  viewer_country?: string;
  session_id?: string;
  view_duration?: number;
  slides_viewed?: number[];
  total_slides_viewed: number;
  completed_presentation: boolean;
  downloaded_pdf: boolean;
  clicked_contact: boolean;
  clicked_financing: boolean;
  form_submitted: boolean;
  referrer_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  started_at: Date;
  ended_at?: Date;
  created_at: Date;
}

export interface PresentationAnalytics {
  total_views: number;
  unique_sessions: number;
  completed_views: number;
  avg_duration: number;
  pdf_downloads: number;
  contact_clicks: number;
  last_viewed?: Date;
  device_breakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
}
```

---

## Database Queries

### Example Queries Using pg Library

```typescript
// db/inspections.ts

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create inspection
export async function createInspection(data: {
  job_id: string;
  user_id: string;
  property_address: string;
  property_city: string;
  property_state: string;
  inspection_date: Date;
  inspector_name: string;
}) {
  const result = await pool.query(
    `INSERT INTO inspections (
      job_id, user_id, property_address, property_city,
      property_state, inspection_date, inspector_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      data.job_id,
      data.user_id,
      data.property_address,
      data.property_city,
      data.property_state,
      data.inspection_date,
      data.inspector_name,
    ]
  );
  return result.rows[0];
}

// Get inspection with photos
export async function getInspectionWithPhotos(inspectionId: string) {
  const result = await pool.query(
    `SELECT
      i.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', ip.id,
            'photo_url', ip.photo_url,
            'photo_order', ip.photo_order,
            'damage_detected', ip.damage_detected,
            'damage_severity', ip.damage_severity,
            'ai_analysis', ip.ai_analysis
          )
          ORDER BY ip.photo_order
        ) FILTER (WHERE ip.id IS NOT NULL),
        '[]'
      ) as photos
    FROM inspections i
    LEFT JOIN inspection_photos ip ON i.id = ip.inspection_id
    WHERE i.id = $1
    GROUP BY i.id`,
    [inspectionId]
  );
  return result.rows[0];
}

// Add photo with AI analysis
export async function addInspectionPhoto(data: {
  inspection_id: string;
  user_id: string;
  photo_url: string;
  photo_order: number;
  ai_analysis?: string;
  damage_detected: boolean;
  damage_categories?: DamageCategory[];
  damage_severity?: DamageSeverity;
}) {
  const result = await pool.query(
    `INSERT INTO inspection_photos (
      inspection_id, user_id, photo_url, photo_order,
      ai_analysis, damage_detected, damage_categories, damage_severity
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.inspection_id,
      data.user_id,
      data.photo_url,
      data.photo_order,
      data.ai_analysis,
      data.damage_detected,
      data.damage_categories || [],
      data.damage_severity,
    ]
  );
  return result.rows[0];
}

// Complete inspection
export async function completeInspection(
  inspectionId: string,
  data: {
    overall_condition: string;
    recommended_action: string;
    estimated_cost: number;
    damage_summary?: string;
  }
) {
  const result = await pool.query(
    `UPDATE inspections
    SET
      inspection_status = 'completed',
      overall_condition = $2,
      recommended_action = $3,
      estimated_cost = $4,
      damage_summary = $5,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [
      inspectionId,
      data.overall_condition,
      data.recommended_action,
      data.estimated_cost,
      data.damage_summary,
    ]
  );
  return result.rows[0];
}

// Create presentation from inspection
export async function createPresentation(inspectionId: string, title?: string) {
  const result = await pool.query(
    `SELECT create_presentation_from_inspection($1, $2) as presentation_id`,
    [inspectionId, title]
  );
  return result.rows[0].presentation_id;
}

// Get presentation by share token
export async function getPresentationByToken(shareToken: string) {
  const result = await pool.query(
    `SELECT * FROM presentations WHERE share_token = $1`,
    [shareToken]
  );
  return result.rows[0];
}

// Share presentation
export async function sharePresentation(data: {
  presentation_id: string;
  user_id: string;
  recipient_email: string;
  share_method: 'email' | 'sms' | 'link' | 'qr_code';
  share_message?: string;
}) {
  const result = await pool.query(
    `INSERT INTO presentation_shares (
      presentation_id, user_id, recipient_email,
      share_method, share_message
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [
      data.presentation_id,
      data.user_id,
      data.recipient_email,
      data.share_method,
      data.share_message,
    ]
  );
  return result.rows[0];
}

// Track presentation view
export async function trackPresentationView(data: {
  presentation_id: string;
  presentation_share_id?: string;
  session_id: string;
  viewer_device?: string;
  viewer_browser?: string;
  viewer_ip?: string;
}) {
  const result = await pool.query(
    `INSERT INTO presentation_views (
      presentation_id, presentation_share_id, session_id,
      viewer_device, viewer_browser, viewer_ip
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      data.presentation_id,
      data.presentation_share_id,
      data.session_id,
      data.viewer_device,
      data.viewer_browser,
      data.viewer_ip,
    ]
  );
  return result.rows[0];
}

// Update view duration when session ends
export async function endPresentationView(
  viewId: string,
  data: {
    view_duration: number;
    slides_viewed: number[];
    completed_presentation: boolean;
    downloaded_pdf?: boolean;
    clicked_contact?: boolean;
  }
) {
  const result = await pool.query(
    `UPDATE presentation_views
    SET
      view_duration = $2,
      slides_viewed = $3,
      total_slides_viewed = $4,
      completed_presentation = $5,
      downloaded_pdf = $6,
      clicked_contact = $7,
      ended_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [
      viewId,
      data.view_duration,
      JSON.stringify(data.slides_viewed),
      data.slides_viewed.length,
      data.completed_presentation,
      data.downloaded_pdf || false,
      data.clicked_contact || false,
    ]
  );
  return result.rows[0];
}

// Get presentation analytics
export async function getPresentationAnalytics(presentationId: string) {
  const result = await pool.query(
    `SELECT * FROM get_presentation_analytics($1)`,
    [presentationId]
  );
  return result.rows[0];
}
```

---

## Frontend Components

### React Component Examples

```tsx
// components/InspectionPhotoUpload.tsx

import React, { useState } from 'react';
import { analyzeImage } from '@/lib/ai';

interface Props {
  inspectionId: string;
  onPhotoAdded: (photo: InspectionPhoto) => void;
}

export function InspectionPhotoUpload({ inspectionId, onPhotoAdded }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      // 1. Upload to storage
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const { url, thumbnail_url } = await uploadRes.json();

      // 2. Get AI analysis
      const aiAnalysis = await analyzeImage(url);

      // 3. Save to database
      const photoRes = await fetch(`/api/inspections/${inspectionId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: url,
          photo_thumbnail_url: thumbnail_url,
          ai_analysis: aiAnalysis.description,
          damage_detected: aiAnalysis.damage_detected,
          damage_categories: aiAnalysis.categories,
          damage_severity: aiAnalysis.severity,
        }),
      });
      const photo = await photoRes.json();

      onPhotoAdded(photo);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <p>Analyzing photo...</p>}
    </div>
  );
}
```

```tsx
// components/PresentationViewer.tsx

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function PresentationViewer() {
  const { shareToken } = useParams();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [viewId, setViewId] = useState<string | null>(null);
  const [slidesViewed, setSlidesViewed] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Load presentation
    fetch(`/api/present/${shareToken}`)
      .then((res) => res.json())
      .then(setPresentation);

    // Track view start
    fetch(`/api/present/${shareToken}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        viewer_device: getDeviceType(),
        viewer_browser: getBrowserName(),
      }),
    })
      .then((res) => res.json())
      .then((data) => setViewId(data.view_id));

    // Track view end on unmount
    return () => {
      if (viewId) {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        navigator.sendBeacon(
          `/api/present/${shareToken}/view/${viewId}`,
          JSON.stringify({
            view_duration: duration,
            slides_viewed: Array.from(slidesViewed),
            completed_presentation: slidesViewed.size === presentation?.slide_count,
          })
        );
      }
    };
  }, []);

  useEffect(() => {
    // Track slide view
    setSlidesViewed((prev) => new Set([...prev, currentSlide]));
  }, [currentSlide]);

  if (!presentation) return <div>Loading...</div>;

  return (
    <div className="presentation-viewer">
      <Slide data={presentation.slides[currentSlide]} />
      <Navigation
        current={currentSlide}
        total={presentation.slide_count}
        onPrev={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
        onNext={() => setCurrentSlide((prev) => Math.min(presentation.slide_count - 1, prev + 1))}
      />
    </div>
  );
}
```

---

## AI Integration

### Gemini Vision Analysis

```typescript
// lib/ai.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function analyzeRoofPhoto(imageUrl: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `Analyze this roof inspection photo and provide:
1. Detailed description of what you see
2. Identify any damage (hail, wind, wear, leaks, missing shingles, etc.)
3. Severity level (minor, moderate, severe, critical)
4. Specific areas of concern
5. Recommendations

Format response as JSON with keys:
- description: string
- damage_detected: boolean
- categories: string[] (from: hail_damage, wind_damage, wear_and_tear, leak, missing_shingles, flashing_damage, gutter_damage, soffit_fascia, chimney, ventilation, other)
- severity: string (minor, moderate, severe, critical)
- areas_of_concern: string[]
- recommendations: string[]`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: await fetchImageAsBase64(imageUrl),
        mimeType: 'image/jpeg',
      },
    },
  ]);

  const response = result.response.text();
  return JSON.parse(response);
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
```

---

## Share URL System

### Generate Share URLs

```typescript
// lib/sharing.ts

export function generateShareUrl(shareToken: string, baseUrl: string): string {
  return `${baseUrl}/present/${shareToken}`;
}

export function generateQRCode(shareUrl: string): Promise<string> {
  // Use QR code library
  return QRCode.toDataURL(shareUrl);
}

export async function sendEmailShare(
  presentation: Presentation,
  share: PresentationShare
) {
  const shareUrl = generateShareUrl(
    presentation.share_token!,
    process.env.PUBLIC_URL!
  );

  await sendEmail({
    to: share.recipient_email,
    subject: `Roof Inspection Report - ${presentation.property_address}`,
    html: `
      <h1>Your Roof Inspection Report is Ready</h1>
      <p>${share.share_message || 'Click below to view your inspection report.'}</p>
      <a href="${shareUrl}">View Report</a>
      <img src="${process.env.PUBLIC_URL}/api/track/email/${share.id}" width="1" height="1" />
    `,
  });

  // Mark email sent
  await pool.query(
    `UPDATE presentation_shares SET email_sent = true, email_sent_at = NOW() WHERE id = $1`,
    [share.id]
  );
}
```

---

## Analytics Tracking

### Client-Side Analytics

```typescript
// hooks/usePresentationAnalytics.ts

import { useEffect, useRef } from 'react';

export function usePresentationAnalytics(presentationId: string, viewId: string) {
  const startTimeRef = useRef(Date.now());
  const slidesViewedRef = useRef(new Set<number>());
  const interactionsRef = useRef({
    downloaded_pdf: false,
    clicked_contact: false,
    clicked_financing: false,
  });

  const trackSlideView = (slideNumber: number) => {
    slidesViewedRef.current.add(slideNumber);
  };

  const trackInteraction = (type: 'pdf' | 'contact' | 'financing') => {
    if (type === 'pdf') interactionsRef.current.downloaded_pdf = true;
    if (type === 'contact') interactionsRef.current.clicked_contact = true;
    if (type === 'financing') interactionsRef.current.clicked_financing = true;
  };

  useEffect(() => {
    // Send analytics on unmount
    return () => {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      navigator.sendBeacon(
        `/api/presentations/${presentationId}/views/${viewId}`,
        JSON.stringify({
          view_duration: duration,
          slides_viewed: Array.from(slidesViewedRef.current),
          ...interactionsRef.current,
        })
      );
    };
  }, []);

  return { trackSlideView, trackInteraction };
}
```

---

## Testing

### Example Tests

```typescript
// tests/inspections.test.ts

import { describe, it, expect } from 'vitest';
import { createInspection, addInspectionPhoto } from '@/db/inspections';

describe('Inspections', () => {
  it('should create inspection', async () => {
    const inspection = await createInspection({
      job_id: 'test-job-id',
      user_id: 'test-user-id',
      property_address: '123 Test St',
      property_city: 'Richmond',
      property_state: 'VA',
      inspection_date: new Date(),
      inspector_name: 'Test Inspector',
    });

    expect(inspection.id).toBeDefined();
    expect(inspection.inspection_status).toBe('scheduled');
  });

  it('should add photo with AI analysis', async () => {
    const photo = await addInspectionPhoto({
      inspection_id: 'test-inspection-id',
      user_id: 'test-user-id',
      photo_url: 'https://example.com/photo.jpg',
      photo_order: 1,
      ai_analysis: 'Hail damage detected',
      damage_detected: true,
      damage_categories: ['hail_damage'],
      damage_severity: 'moderate',
    });

    expect(photo.id).toBeDefined();
    expect(photo.damage_detected).toBe(true);
  });
});
```

---

## Best Practices

1. **Always use transactions** for multi-step operations
2. **Validate share tokens** before allowing access
3. **Rate limit** analytics tracking endpoints
4. **Optimize images** before storing (thumbnails, compression)
5. **Use background jobs** for PDF generation
6. **Cache presentation data** for public views
7. **Implement CSP** headers for security
8. **Track errors** in analytics pipeline

---

**Last Updated:** February 8, 2025
**For:** Gemini Field Assistant v2.x
