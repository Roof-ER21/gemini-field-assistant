/**
 * Inspection Presentation Service
 * Handles saving photos and creating presentations with database persistence
 */

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

export interface PhotoData {
  id: string;
  file: File;
  preview: string;
  base64?: string;
  status: 'uploading' | 'analyzing' | 'complete' | 'error';
  analysis?: PhotoAnalysis;
}

export interface HomeownerInfo {
  name: string;
  phone: string;
  address: string;
}

export interface PresentationSlide {
  id: string;
  type: 'cover' | 'rep_profile' | 'photo' | 'summary' | 'recommendations' | 'cta';
  title: string;
  content?: string;
  photo?: string;
  photoBase64?: string;
  photoId?: string; // Database photo ID
  analysis?: PhotoAnalysis;
  order: number;
}

/**
 * Create inspection and save photos to database
 */
export async function createInspectionWithPhotos(
  userEmail: string,
  homeownerInfo: HomeownerInfo,
  photos: PhotoData[]
): Promise<{ inspectionId: string; photoIds: string[] }> {
  // Step 1: Create Inspection
  const inspectionResponse = await fetch('/api/inspections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail
    },
    body: JSON.stringify({
      property_address: homeownerInfo.address || 'Address pending',
      customer_name: homeownerInfo.name || 'Homeowner',
      inspection_date: new Date().toISOString(),
      status: 'in_progress'
    })
  });

  if (!inspectionResponse.ok) {
    const error = await inspectionResponse.json();
    console.error('[Inspection] API error:', error);
    throw new Error(error.error || 'Failed to create inspection');
  }

  const inspectionData = await inspectionResponse.json();
  console.log('[Inspection] API response:', inspectionData);

  if (!inspectionData.inspection || !inspectionData.inspection.id) {
    console.error('[Inspection] Invalid response structure:', inspectionData);
    throw new Error('Inspection created but no ID returned');
  }

  const inspectionId = inspectionData.inspection.id;

  // Step 2: Save each photo to database
  const photoIds: string[] = [];
  const completedPhotos = photos.filter(p => p.status === 'complete');

  for (const photo of completedPhotos) {
    try {
      const photoResponse = await fetch(`/api/inspections/${inspectionId}/photos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({
          photo_data: photo.base64, // base64 string
          file_name: photo.file.name,
          file_size: photo.file.size,
          mime_type: photo.file.type,
          category: photo.analysis?.severity === 'critical' || photo.analysis?.severity === 'severe'
            ? 'damage'
            : 'detail',
          notes: photo.analysis?.description || '',
          ai_analysis: photo.analysis // Save AI analysis with photo
        })
      });

      if (photoResponse.ok) {
        const photoData = await photoResponse.json();
        console.log('[Photo] Saved photo:', photoData);
        if (photoData.photo && photoData.photo.id) {
          photoIds.push(photoData.photo.id);
        } else {
          console.warn('[Photo] Missing photo ID in response:', photoData);
        }
      } else {
        const errorData = await photoResponse.json().catch(() => ({}));
        console.error('[Photo] Failed to save photo:', errorData);
      }
    } catch (photoError) {
      console.error('[Photo] Error saving photo:', photoError);
      // Continue with other photos
    }
  }

  // Step 3: Update inspection status
  await fetch(`/api/inspections/${inspectionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail
    },
    body: JSON.stringify({
      status: 'completed'
    })
  });

  return { inspectionId, photoIds };
}

/**
 * Create presentation and save to database
 */
export async function createPresentation(
  userEmail: string,
  inspectionId: string,
  slides: PresentationSlide[],
  homeownerInfo: HomeownerInfo
): Promise<{ presentationId: string; shareToken?: string }> {
  const response = await fetch('/api/presentations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail
    },
    body: JSON.stringify({
      inspection_id: inspectionId,
      title: `Roof Inspection - ${homeownerInfo.address || 'Property'}`,
      customer_name: homeownerInfo.name || 'Homeowner',
      property_address: homeownerInfo.address || 'Address pending',
      presentation_type: 'insurance',
      slides: slides,
      status: 'ready'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[Presentation] API error:', error);
    throw new Error(error.error || 'Failed to create presentation');
  }

  const data = await response.json();
  console.log('[Presentation] API response:', JSON.stringify(data, null, 2));
  console.log('[Presentation] Response keys:', Object.keys(data));
  console.log('[Presentation] Has presentation?', !!data.presentation);
  console.log('[Presentation] Presentation data:', data.presentation);

  if (!data.presentation || !data.presentation.id) {
    console.error('[Presentation] Invalid response structure:', JSON.stringify(data, null, 2));
    throw new Error('Presentation created but no ID returned');
  }

  return { presentationId: data.presentation.id, shareToken: data.presentation.share_token };
}

/**
 * Share presentation (generates public link)
 */
export async function sharePresentation(
  userEmail: string,
  presentationId: string
): Promise<{ shareUrl: string; shareToken: string }> {
  const response = await fetch(`/api/presentations/${presentationId}/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to share presentation');
  }

  const { share_url, share_token } = await response.json();
  return { shareUrl: share_url, shareToken: share_token };
}

/**
 * Load presentation by share token (public access)
 */
export async function loadPresentationByToken(
  token: string
): Promise<{ presentation: any; photos: any[] }> {
  const response = await fetch(`/api/present/${token}`);

  if (!response.ok) {
    throw new Error('Presentation not found or not public');
  }

  const { presentation } = await response.json();

  // Load photos from database
  const photosResponse = await fetch(`/api/inspections/${presentation.inspection_id}/photos`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  let photos = [];
  if (photosResponse.ok) {
    const photosData = await photosResponse.json();
    photos = photosData.photos || [];
  }

  return { presentation, photos };
}

/**
 * Load inspection with photos
 */
export async function loadInspectionWithPhotos(
  userEmail: string,
  inspectionId: string
): Promise<{ inspection: any; photos: any[] }> {
  // Get inspection
  const inspectionResponse = await fetch(`/api/inspections/${inspectionId}`, {
    headers: {
      'x-user-email': userEmail
    }
  });

  if (!inspectionResponse.ok) {
    throw new Error('Inspection not found');
  }

  const { inspection } = await inspectionResponse.json();

  // Get photos
  const photosResponse = await fetch(`/api/inspections/${inspectionId}/photos`, {
    headers: {
      'x-user-email': userEmail
    }
  });

  let photos = [];
  if (photosResponse.ok) {
    const photosData = await photosResponse.json();
    photos = photosData.photos || [];
  }

  return { inspection, photos };
}
