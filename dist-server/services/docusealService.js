/**
 * DocuSeal Service
 *
 * REST client for DocuSeal e-signature API.
 * Handles template management, submission creation, and webhook processing.
 * Falls back gracefully when DocuSeal is not configured.
 */
const DOCUSEAL_API_URL = process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com';
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || '';
class DocuSealService {
    apiUrl;
    apiKey;
    constructor() {
        this.apiUrl = DOCUSEAL_API_URL;
        this.apiKey = DOCUSEAL_API_KEY;
    }
    /** Check if DocuSeal is configured */
    isConfigured() {
        return !!this.apiKey;
    }
    async request(path, options = {}) {
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
    async listTemplates() {
        const data = await this.request('/templates');
        return Array.isArray(data) ? data : data.data || [];
    }
    /** Get a specific template */
    async getTemplate(templateId) {
        return this.request(`/templates/${templateId}`);
    }
    /** Create a submission (signing request) from a template */
    async createSubmission(params) {
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
    async getSubmission(submissionId) {
        return this.request(`/submissions/${submissionId}`);
    }
    /** Download the completed signed document */
    async downloadDocument(submissionId) {
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
    processWebhook(body) {
        try {
            const eventType = body.event_type || body.type || '';
            const data = body.data || body;
            const submissionId = data.submission_id || data.id;
            if (!submissionId)
                return null;
            return {
                eventType,
                submissionId,
                status: data.status || 'unknown',
                completedAt: data.completed_at,
            };
        }
        catch {
            return null;
        }
    }
}
export const docusealService = new DocuSealService();
export default docusealService;
