/**
 * DocuSeal Service
 *
 * REST client for DocuSeal e-signature API.
 * Handles template management, submission creation, and webhook processing.
 * Falls back gracefully when DocuSeal is not configured.
 */

const DOCUSEAL_API_URL = process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com';
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || '';

export interface DocuSealTemplate {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
}

export interface DocuSealSubmission {
  id: number;
  slug: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  submitters: Array<{
    id: number;
    slug: string;
    email: string;
    status: string;
    role: string;
    completed_at?: string;
    embed_src?: string;
  }>;
  documents?: Array<{
    name: string;
    url: string;
  }>;
}

export interface CreateSubmissionParams {
  templateId: number;
  submitters: Array<{
    email: string;
    role?: string;
    fields?: Array<{ name: string; default_value: string }>;
  }>;
  sendEmail?: boolean;
  message?: string;
}

class DocuSealService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = DOCUSEAL_API_URL;
    this.apiKey = DOCUSEAL_API_KEY;
  }

  /** Check if DocuSeal is configured */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('DocuSeal is not configured. Set DOCUSEAL_API_KEY environment variable.');
    }

    const url = `${this.apiUrl}/api${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Auth-Token': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DocuSeal API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /** List all templates */
  async listTemplates(): Promise<DocuSealTemplate[]> {
    const data = await this.request('/templates');
    return Array.isArray(data) ? data : data.data || [];
  }

  /** Get a specific template */
  async getTemplate(templateId: number): Promise<DocuSealTemplate> {
    return this.request(`/templates/${templateId}`);
  }

  /** Create a submission (signing request) from a template */
  async createSubmission(params: CreateSubmissionParams): Promise<DocuSealSubmission> {
    return this.request('/submissions', {
      method: 'POST',
      body: JSON.stringify({
        template_id: params.templateId,
        send_email: params.sendEmail ?? false,
        message: params.message,
        submitters: params.submitters.map(s => ({
          email: s.email,
          role: s.role || 'Signer',
          fields: s.fields || [],
        })),
      }),
    });
  }

  /** Get submission details */
  async getSubmission(submissionId: number): Promise<DocuSealSubmission> {
    return this.request(`/submissions/${submissionId}`);
  }

  /** Download the completed signed document */
  async downloadDocument(submissionId: number): Promise<{ url: string; name: string } | null> {
    const submission = await this.getSubmission(submissionId);
    if (submission.documents && submission.documents.length > 0) {
      return submission.documents[0];
    }
    return null;
  }

  /**
   * Process a webhook event from DocuSeal.
   * Returns the submission ID and completion status.
   */
  processWebhook(body: any): {
    eventType: string;
    submissionId: number;
    status: string;
    completedAt?: string;
  } | null {
    try {
      const eventType = body.event_type || body.type || '';
      const data = body.data || body;
      const submissionId = data.submission_id || data.id;

      if (!submissionId) return null;

      return {
        eventType,
        submissionId,
        status: data.status || 'unknown',
        completedAt: data.completed_at,
      };
    } catch {
      return null;
    }
  }
}

export const docusealService = new DocuSealService();
export default docusealService;
