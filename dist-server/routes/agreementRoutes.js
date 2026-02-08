/**
 * Agreement Routes - API for managing signed agreements
 * Handles Claim Authorization and Contingency agreements with e-signatures
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
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
            // If customer email provided, queue email for sending
            if (data.customerEmail) {
                await pool.query(`INSERT INTO agreement_emails (agreement_id, recipient_email, email_type, status)
         VALUES ($1, $2, 'signed_copy', 'pending')`, [agreementId, data.customerEmail]);
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
    // POST /api/agreements/:id/email - Resend agreement email
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
            // Queue email for sending
            await pool.query(`INSERT INTO agreement_emails (agreement_id, recipient_email, email_type, status)
       VALUES ($1, $2, 'signed_copy', 'pending')`, [id, recipientEmail]);
            // Log the email action
            await pool.query(`SELECT log_agreement_action($1, 'emailed', 'system', NULL, NULL, NULL, $2)`, [id, JSON.stringify({ recipientEmail })]);
            res.json({
                success: true,
                message: 'Email queued for sending'
            });
        }
        catch (error) {
            console.error('Error queueing email:', error);
            res.status(500).json({ error: 'Failed to queue email' });
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
