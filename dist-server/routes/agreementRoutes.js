/**
 * Agreement Routes - API for managing signed agreements
 * Handles Claim Authorization and Contingency agreements with e-signatures
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { emailService } from '../services/emailService.js';
import { docusealService } from '../services/docusealService.js';
// Create agreement routes with database pool injection
export function createAgreementRoutes(dbPool) {
    const router = Router();
    const pool = dbPool;
    // POST /api/agreements - Create a signed agreement
    router.post('/', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            // Get user ID
            const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            const data = req.body;
            // Validate required fields
            if (!data.agreementType || !data.customerName || !data.customerSignature1) {
                return res.status(400).json({
                    error: 'Missing required fields: agreementType, customerName, customerSignature1'
                });
            }
            // For contingency agreements, agent signature is required
            if (data.agreementType === 'contingency' && !data.agentSignature) {
                return res.status(400).json({
                    error: 'Agent signature is required for contingency agreements'
                });
            }
            // Get client IP and user agent for audit
            const ipAddress = req.ip || req.socket.remoteAddress || null;
            const userAgent = req.headers['user-agent'] || null;
            // Create agreement
            const agreementId = uuidv4();
            const result = await pool.query(`INSERT INTO agreements (
        id, user_id, agreement_type, presentation_id, inspection_id, job_id,
        customer_name, customer_address, customer_phone, customer_email,
        insurance_company, claim_number, deductible,
        agent_signature, agent_name, customer_signature_1, customer_signature_2,
        notes, form_data, ip_address, user_agent, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'signed')
      RETURNING *`, [
                agreementId,
                userId,
                data.agreementType,
                data.presentationId || null,
                data.inspectionId || null,
                data.jobId || null,
                data.customerName,
                data.customerAddress || null,
                data.customerPhone || null,
                data.customerEmail || null,
                data.insuranceCompany || null,
                data.claimNumber || null,
                data.deductible || null,
                data.agentSignature || null,
                data.agentName || null,
                data.customerSignature1,
                data.customerSignature2 || null,
                data.notes || null,
                data.formData ? JSON.stringify(data.formData) : null,
                ipAddress,
                userAgent
            ]);
            // Log the signing action
            await pool.query(`SELECT log_agreement_action($1, 'signed', 'customer', $2, $3, $4, $5)`, [
                agreementId,
                userId,
                ipAddress,
                userAgent,
                JSON.stringify({ agreementType: data.agreementType })
            ]);
            // If customer email provided, send signed copy immediately (fire-and-forget)
            if (data.customerEmail) {
                const firstName = (data.customerName || 'Homeowner').split(' ')[0];
                const agreementLabel = data.agreementType === 'contingency'
                    ? 'Contingency Agreement' : 'Claim Authorization';
                emailService.sendCustomEmail(data.customerEmail, {
                    subject: `Your Signed ${agreementLabel} — The Roof Docs`,
                    html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; padding: 20px; background: #082c4b;">
              <img src="https://www.theroofdocs.com/wp-content/uploads/2025/03/logo_footer_alt.0cc2e436.png"
                   alt="The Roof Docs" style="max-width: 180px;" />
            </div>
            <div style="padding: 30px 20px;">
              <h2 style="color: #082c4b; margin-top: 0;">Hi ${firstName},</h2>
              <p>Thank you for signing your <strong>${agreementLabel}</strong> with The Roof Docs.</p>
              <p>Here are the details for your records:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Document</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${agreementLabel}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Property</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.customerAddress || 'On file'}</td></tr>
                ${data.insuranceCompany ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Insurance</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.insuranceCompany}</td></tr>` : ''}
              </table>
              <p style="margin-top: 24px;">A copy of the signed document will be available through your representative. Questions? Call us:</p>
              <p><strong>The Roof Docs</strong><br/>
              <a href="tel:+15715208507">(571) 520-8507</a></p>
            </div>
            <div style="padding: 16px 20px; background: #f5f5f5; text-align: center; font-size: 12px; color: #999;">
              <p>The Roof Docs • 8100 Boone Blvd, Suite 400, Vienna, VA 22182</p>
              <p>GAF Master Elite Certified • BBB A+ Rated</p>
            </div>
          </div>
        `,
                    text: `Hi ${firstName}, thank you for signing your ${agreementLabel} with The Roof Docs. Property: ${data.customerAddress || 'On file'}. Questions? Call (571) 520-8507.`,
                }).then(sent => {
                    pool.query(`INSERT INTO agreement_emails (agreement_id, recipient_email, email_type, status)
           VALUES ($1, $2, 'signed_copy', $3)`, [agreementId, data.customerEmail, sent ? 'sent' : 'failed']).catch(() => { });
                }).catch(() => { });
            }
            res.status(201).json({
                success: true,
                agreementId: result.rows[0].id,
                signedAt: result.rows[0].signed_at,
                message: 'Agreement signed successfully'
            });
        }
        catch (error) {
            console.error('Error creating agreement:', error);
            res.status(500).json({ error: 'Failed to create agreement' });
        }
    });
    // GET /api/agreements/:id - Get agreement by ID
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const userEmail = req.headers['x-user-email'];
            const result = await pool.query(`SELECT a.*, u.name as user_name, u.email as user_email
       FROM agreements a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`, [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Agreement not found' });
            }
            const agreement = result.rows[0];
            // Log view action
            const ipAddress = req.ip || req.socket.remoteAddress || null;
            const userAgent = req.headers['user-agent'] || null;
            await pool.query(`SELECT log_agreement_action($1, 'viewed', 'user', NULL, $2, $3, NULL)`, [id, ipAddress, userAgent]);
            res.json(agreement);
        }
        catch (error) {
            console.error('Error fetching agreement:', error);
            res.status(500).json({ error: 'Failed to fetch agreement' });
        }
    });
    // GET /api/agreements - List agreements for user
    router.get('/', async (req, res) => {
        try {
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { presentationId, inspectionId, jobId, type, status, limit = '50', offset = '0' } = req.query;
            let query = `
      SELECT a.id, a.agreement_type, a.customer_name, a.customer_email,
             a.insurance_company, a.claim_number, a.status, a.signed_at, a.created_at,
             p.title as presentation_title
      FROM agreements a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN presentations p ON a.presentation_id = p.id
      WHERE u.email = $1
    `;
            const params = [userEmail];
            let paramIndex = 2;
            if (presentationId) {
                query += ` AND a.presentation_id = $${paramIndex++}`;
                params.push(presentationId);
            }
            if (inspectionId) {
                query += ` AND a.inspection_id = $${paramIndex++}`;
                params.push(inspectionId);
            }
            if (jobId) {
                query += ` AND a.job_id = $${paramIndex++}`;
                params.push(jobId);
            }
            if (type) {
                query += ` AND a.agreement_type = $${paramIndex++}`;
                params.push(type);
            }
            if (status) {
                query += ` AND a.status = $${paramIndex++}`;
                params.push(status);
            }
            query += ` ORDER BY a.signed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit));
            params.push(parseInt(offset));
            const result = await pool.query(query, params);
            res.json({
                agreements: result.rows,
                count: result.rows.length
            });
        }
        catch (error) {
            console.error('Error listing agreements:', error);
            res.status(500).json({ error: 'Failed to list agreements' });
        }
    });
    // GET /api/agreements/:id/logs - Get agreement audit logs
    router.get('/:id/logs', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(`SELECT * FROM agreement_logs
       WHERE agreement_id = $1
       ORDER BY timestamp DESC`, [id]);
            res.json(result.rows);
        }
        catch (error) {
            console.error('Error fetching agreement logs:', error);
            res.status(500).json({ error: 'Failed to fetch agreement logs' });
        }
    });
    // POST /api/agreements/:id/void - Void an agreement
    router.post('/:id/void', async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const userEmail = req.headers['x-user-email'];
            if (!userEmail) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            // Get user ID
            const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            const userId = userResult.rows[0].id;
            // Verify agreement exists and belongs to user
            const agreementResult = await pool.query(`SELECT a.* FROM agreements a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1 AND u.email = $2`, [id, userEmail]);
            if (agreementResult.rows.length === 0) {
                return res.status(404).json({ error: 'Agreement not found' });
            }
            if (agreementResult.rows[0].status === 'voided') {
                return res.status(400).json({ error: 'Agreement is already voided' });
            }
            // Void the agreement
            await pool.query(`UPDATE agreements SET status = 'voided', updated_at = NOW() WHERE id = $1`, [id]);
            // Log the void action
            const ipAddress = req.ip || req.socket.remoteAddress || null;
            const userAgent = req.headers['user-agent'] || null;
            await pool.query(`SELECT log_agreement_action($1, 'voided', 'user', $2, $3, $4, $5)`, [id, userId, ipAddress, userAgent, JSON.stringify({ reason })]);
            res.json({
                success: true,
                message: 'Agreement voided successfully'
            });
        }
        catch (error) {
            console.error('Error voiding agreement:', error);
            res.status(500).json({ error: 'Failed to void agreement' });
        }
    });
    // POST /api/agreements/:id/email - Send signed agreement to homeowner
    router.post('/:id/email', async (req, res) => {
        try {
            const { id } = req.params;
            const { email } = req.body;
            // Get agreement
            const agreementResult = await pool.query('SELECT * FROM agreements WHERE id = $1', [id]);
            if (agreementResult.rows.length === 0) {
                return res.status(404).json({ error: 'Agreement not found' });
            }
            const agreement = agreementResult.rows[0];
            const recipientEmail = email || agreement.customer_email;
            if (!recipientEmail) {
                return res.status(400).json({ error: 'No email address provided' });
            }
            const firstName = (agreement.customer_name || 'Homeowner').split(' ')[0];
            const agreementLabel = agreement.agreement_type === 'contingency'
                ? 'Contingency Agreement' : 'Claim Authorization';
            // Try to get the signed PDF URL from DocuSeal
            let pdfLink = '';
            if (agreement.signed_pdf_url) {
                pdfLink = `<p><a href="${agreement.signed_pdf_url}" style="display:inline-block;padding:12px 24px;background:#082c4b;color:white;text-decoration:none;border-radius:6px;font-weight:600;">Download Signed Document</a></p>`;
            }
            else if (agreement.docuseal_submission_id && docusealService.isConfigured()) {
                try {
                    const doc = await docusealService.downloadDocument(agreement.docuseal_submission_id);
                    if (doc?.url) {
                        pdfLink = `<p><a href="${doc.url}" style="display:inline-block;padding:12px 24px;background:#082c4b;color:white;text-decoration:none;border-radius:6px;font-weight:600;">Download Signed Document</a></p>`;
                        // Save the URL for future use
                        await pool.query('UPDATE agreements SET signed_pdf_url = $1 WHERE id = $2', [doc.url, id]);
                    }
                }
                catch {
                    // Non-fatal — send email without PDF link
                }
            }
            const signedDate = agreement.signed_at
                ? new Date(agreement.signed_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })
                : 'N/A';
            // Send the email
            const sent = await emailService.sendCustomEmail(recipientEmail, {
                subject: `Your Signed ${agreementLabel} — The Roof Docs`,
                html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; padding: 20px; background: #082c4b;">
            <img src="https://www.theroofdocs.com/wp-content/uploads/2025/03/logo_footer_alt.0cc2e436.png"
                 alt="The Roof Docs" style="max-width: 180px;" />
          </div>
          <div style="padding: 30px 20px;">
            <h2 style="color: #082c4b; margin-top: 0;">Hi ${firstName},</h2>
            <p>Thank you for signing your <strong>${agreementLabel}</strong> with The Roof Docs.</p>
            <p>Here are the details for your records:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Document</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${agreementLabel}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Property</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${agreement.customer_address || 'On file'}</td></tr>
              ${agreement.insurance_company ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Insurance</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${agreement.insurance_company}</td></tr>` : ''}
              ${agreement.claim_number ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Claim #</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${agreement.claim_number}</td></tr>` : ''}
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Signed</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${signedDate}</td></tr>
            </table>
            ${pdfLink}
            <p style="margin-top: 24px;">If you have any questions, don't hesitate to reach out:</p>
            <p><strong>The Roof Docs</strong><br/>
            <a href="tel:+15715208507">(571) 520-8507</a><br/>
            <a href="mailto:marketing@theroofdocs.com">marketing@theroofdocs.com</a></p>
          </div>
          <div style="padding: 16px 20px; background: #f5f5f5; text-align: center; font-size: 12px; color: #999;">
            <p>The Roof Docs • 8100 Boone Blvd, Suite 400, Vienna, VA 22182</p>
            <p>GAF Master Elite Certified • BBB A+ Rated</p>
            <p>VA License: 2705194709 | MD License: 164697 | PA License: 145926</p>
          </div>
        </div>
      `,
                text: `Hi ${firstName}, your signed ${agreementLabel} with The Roof Docs is attached. Property: ${agreement.customer_address || 'On file'}. Signed: ${signedDate}. Questions? Call (571) 520-8507.`,
            });
            // Log to agreement_emails table
            await pool.query(`INSERT INTO agreement_emails (agreement_id, recipient_email, email_type, status)
       VALUES ($1, $2, 'signed_copy', $3)`, [id, recipientEmail, sent ? 'sent' : 'failed']);
            // Log the email action
            await pool.query(`SELECT log_agreement_action($1, 'emailed', 'system', NULL, NULL, NULL, $2)`, [id, JSON.stringify({ recipientEmail, sent })]);
            if (!sent) {
                return res.status(500).json({ error: 'Failed to send email — check email provider config' });
            }
            res.json({
                success: true,
                message: `Signed agreement emailed to ${recipientEmail}`,
            });
        }
        catch (error) {
            console.error('Error sending agreement email:', error);
            res.status(500).json({ error: 'Failed to send agreement email' });
        }
    });
    // GET /api/agreements/presentation/:presentationId - Get agreements for a presentation
    router.get('/presentation/:presentationId', async (req, res) => {
        try {
            const { presentationId } = req.params;
            const result = await pool.query(`SELECT * FROM agreements
       WHERE presentation_id = $1
       ORDER BY created_at DESC`, [presentationId]);
            res.json(result.rows);
        }
        catch (error) {
            console.error('Error fetching presentation agreements:', error);
            res.status(500).json({ error: 'Failed to fetch agreements' });
        }
    });
    return router;
}
