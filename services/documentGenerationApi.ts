/**
 * Document Generation API Client
 *
 * Frontend service for generating and downloading documents via the Carbone backend.
 */

import { getApiBaseUrl } from './config';
import { authService } from './authService';

const API = getApiBaseUrl();

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  filename: string;
  fields: string[];
}

/** Fetch available document templates */
export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  const email = authService.getCurrentUser()?.email || '';
  const res = await fetch(`${API}/documents/templates`, {
    headers: { 'x-user-email': email },
  });

  if (!res.ok) throw new Error('Failed to fetch templates');
  const data = await res.json();
  return data.templates || [];
}

/** Generate and download a document */
export async function generateDocument(
  templateId: string,
  data: Record<string, any>,
  options?: { convertTo?: string }
): Promise<void> {
  const email = authService.getCurrentUser()?.email || '';
  const res = await fetch(`${API}/documents/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
    body: JSON.stringify({ templateId, data, convertTo: options?.convertTo }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Failed to generate document');
  }

  // Trigger browser download
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename="(.+)"/);
  const filename = filenameMatch ? filenameMatch[1] : `document-${Date.now()}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Preview what data will be used for a template (no download) */
export async function previewDocument(
  templateId: string,
  data: Record<string, any>
): Promise<{ template: DocumentTemplate; mappedData: Record<string, any> }> {
  const email = authService.getCurrentUser()?.email || '';
  const res = await fetch(`${API}/documents/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
    body: JSON.stringify({ templateId, data }),
  });

  if (!res.ok) throw new Error('Failed to preview document');
  return res.json();
}
