/**
 * DocuSeal Routes - E-Signature API Integration
 *
 * Endpoints for creating signing sessions, receiving webhooks,
 * and managing DocuSeal templates and submissions.
 */
import { Router } from 'express';
import { docusealService } from '../services/docusealService.js';
export function createDocuSealRoutes(dbPool) {
    const router = Router();
    const pool = dbPool;
    /**
     * GET /api/docuseal/status
     * Check if DocuSeal is configured
     */
    router.get('/status', (_req, res) => {
        res.json({
            configured: docusealService.isConfigured(),
            apiUrl: process.env.DOCUSEAL_API_URL || 'https://api.docuseal.co',
        });
    });
    /**
     * GET /api/docuseal/templates
     * List available DocuSeal templates (admin only)
     */
    router.get('/templates', async (req, res) => {
        try {
            if (!docusealService.isConfigured()) {
                return res.json({ templates: [], message: 'DocuSeal not configured' });
            }
            const templates = await docusealService.listTemplates();
            res.json({ templates });
        }
        catch (error) {
            console.error('[DocuSeal] List templates error:', error);
            res.status(500).json({ error: 'Failed to list templates' });
        }
    });
    /**
     * POST /api/docuseal/submissions
     * Create a new signing session from an agreement
     */
    router.post('/submissions', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            if (!docusealService.isConfigured()) {
                return res.status(503).json({ error: 'DocuSeal not configured' });
            }
            const { agreementId, templateId, customerName, customerEmail, customerAddress, insuranceCompany, claimNumber, agentName, sendEmail = false, } = req.body;
            if (!templateId) {
                return res.status(400).json({ error: 'templateId is required' });
            }
            // Pre-fill fields from agreement data
            const fields = [];
            if (customerName)
                fields.push({ name: 'Customer Name', default_value: customerName });
            if (customerAddress)
                fields.push({ name: 'Property Address', default_value: customerAddress });
            if (insuranceCompany)
                fields.push({ name: 'Insurance Company', default_value: insuranceCompany });
            if (claimNumber)
                fields.push({ name: 'Claim Number', default_value: claimNumber });
            if (agentName)
                fields.push({ name: 'Agent Name', default_value: agentName });
            fields.push({ name: 'Date', default_value: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }) });
            const signerEmail = customerEmail || 'signer@placeholder.com';
            const submission = await docusealService.createSubmission({
                templateId,
                submitters: [{ email: signerEmail, role: 'Signer', fields }],
                sendEmail,
            });
            // If we have an agreement ID, update it with DocuSeal tracking
            if (agreementId) {
                await pool.query(`UPDATE agreements SET
            docuseal_submission_id = $1,
            docuseal_slug = $2,
            signing_method = 'docuseal',
            status = 'awaiting_signature',
            updated_at = NOW()
          WHERE id = $3`, [submission.id, submission.submitters?.[0]?.slug || null, agreementId]);
            }
            // Return the embed src URL for the frontend widget
            const embedSrc = submission.submitters?.[0]?.embed_src || null;
            res.json({
                submissionId: submission.id,
                slug: submission.submitters?.[0]?.slug || null,
                embedSrc,
                status: 'awaiting_signature',
            });
        }
        catch (error) {
            console.error('[DocuSeal] Create submission error:', error);
            res.status(500).json({ error: 'Failed to create signing session' });
        }
    });
    /**
     * POST /api/docuseal/webhook
     * Receive webhook events from DocuSeal (form.completed, etc.)
     */
    router.post('/webhook', async (req, res) => {
        try {
            const event = docusealService.processWebhook(req.body);
            if (!event) {
                return res.status(400).json({ error: 'Invalid webhook payload' });
            }
            console.log(`[DocuSeal] Webhook: ${event.eventType} for submission ${event.submissionId}`);
            if (event.eventType === 'form.completed' || event.status === 'completed') {
                // Update the agreement status to signed
                const result = await pool.query(`UPDATE agreements SET
            status = 'signed',
            signed_at = NOW(),
            updated_at = NOW()
          WHERE docuseal_submission_id = $1
          RETURNING id`, [event.submissionId]);
                if (result.rows.length > 0) {
                    const agreementId = result.rows[0].id;
                    // Fetch the signed document URL
                    const doc = await docusealService.downloadDocument(event.submissionId);
                    if (doc) {
                        await pool.query('UPDATE agreements SET signed_pdf_url = $1 WHERE id = $2', [doc.url, agreementId]);
                    }
                    // Log the signing action
                    await pool.query(`INSERT INTO agreement_logs (agreement_id, action, actor_type, details)
             VALUES ($1, 'signed', 'customer', $2)`, [agreementId, JSON.stringify({ source: 'docuseal', submissionId: event.submissionId })]);
                    console.log(`[DocuSeal] Agreement ${agreementId} marked as signed`);
                }
            }
            res.json({ received: true });
        }
        catch (error) {
            console.error('[DocuSeal] Webhook error:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    });
    /**
     * GET /api/docuseal/submissions/:id
     * Get submission status and download link
     */
    router.get('/submissions/:id', async (req, res) => {
        try {
            if (!docusealService.isConfigured()) {
                return res.status(503).json({ error: 'DocuSeal not configured' });
            }
            const submissionId = parseInt(req.params.id);
            if (isNaN(submissionId)) {
                return res.status(400).json({ error: 'Invalid submission ID' });
            }
            const submission = await docusealService.getSubmission(submissionId);
            res.json(submission);
        }
        catch (error) {
            console.error('[DocuSeal] Get submission error:', error);
            res.status(500).json({ error: 'Failed to get submission' });
        }
    });
    /**
     * GET /api/docuseal/submissions/:id/document
     * Download the signed PDF
     */
    router.get('/submissions/:id/document', async (req, res) => {
        try {
            if (!docusealService.isConfigured()) {
                return res.status(503).json({ error: 'DocuSeal not configured' });
            }
            const submissionId = parseInt(req.params.id);
            if (isNaN(submissionId)) {
                return res.status(400).json({ error: 'Invalid submission ID' });
            }
            const doc = await docusealService.downloadDocument(submissionId);
            if (!doc) {
                return res.status(404).json({ error: 'No document available' });
            }
            res.json({ url: doc.url, name: doc.name });
        }
        catch (error) {
            console.error('[DocuSeal] Download document error:', error);
            res.status(500).json({ error: 'Failed to download document' });
        }
    });
    return router;
}
