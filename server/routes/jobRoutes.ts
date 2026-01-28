/**
 * Job Management API Routes
 * Full CRUD operations for jobs with database persistence
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// Get pool from app
const getPool = (req: Request): Pool => {
  return req.app.get('pool');
};

// Get user ID from email
const getUserIdFromEmail = async (pool: Pool, email: string): Promise<string | null> => {
  const result = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows[0]?.id || null;
};

// ============ GET /api/jobs - List all jobs for user ============
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is admin (can see all jobs)
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    const isAdmin = userResult.rows[0]?.role === 'admin';

    // Build query based on filters
    const { status, priority, search, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        j.*,
        u.email as user_email,
        COALESCE(u.name, SPLIT_PART(u.email, '@', 1)) as user_name
      FROM jobs j
      JOIN users u ON j.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by user unless admin
    if (!isAdmin) {
      query += ` AND j.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    // Filter by status
    if (status) {
      const statuses = (status as string).split(',');
      query += ` AND j.status = ANY($${paramIndex})`;
      params.push(statuses);
      paramIndex++;
    }

    // Filter by priority
    if (priority) {
      query += ` AND j.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    // Search
    if (search) {
      query += ` AND (
        j.title ILIKE $${paramIndex} OR
        j.job_number ILIKE $${paramIndex} OR
        j.customer->>'name' ILIKE $${paramIndex} OR
        j.property->>'address' ILIKE $${paramIndex} OR
        j.property->>'city' ILIKE $${paramIndex} OR
        j.insurance->>'company' ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY j.updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Transform to frontend format
    const jobs = result.rows.map(row => ({
      id: row.id,
      jobNumber: row.job_number,
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_name,
      title: row.title,
      status: row.status,
      priority: row.priority,
      leadSource: row.lead_source,
      customer: row.customer,
      property: row.property,
      roofDetails: row.roof_details,
      damage: row.damage,
      insurance: row.insurance,
      financials: row.financials,
      notes: row.notes || [],
      attachments: row.attachments || [],
      actions: row.actions || [],
      tags: row.tags || [],
      inspectionDate: row.inspection_date,
      contractSignedDate: row.contract_signed_date,
      scheduledInstallDate: row.scheduled_install_date,
      completedDate: row.completed_date,
      linkedChatSessionId: row.linked_chat_session_id,
      linkedTranscriptIds: row.linked_transcript_ids || [],
      linkedEmailIds: row.linked_email_ids || [],
      linkedImageAnalysisIds: row.linked_image_analysis_ids || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({ jobs, total: jobs.length });
  } catch (error) {
    console.error('[Jobs API] Error listing jobs:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// ============ GET /api/jobs/:id - Get single job ============
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `SELECT j.*, u.email as user_email, COALESCE(u.name, SPLIT_PART(u.email, '@', 1)) as user_name
       FROM jobs j
       JOIN users u ON j.user_id = u.id
       WHERE j.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const row = result.rows[0];

    // Check ownership or admin
    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (row.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const job = {
      id: row.id,
      jobNumber: row.job_number,
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_name,
      title: row.title,
      status: row.status,
      priority: row.priority,
      leadSource: row.lead_source,
      customer: row.customer,
      property: row.property,
      roofDetails: row.roof_details,
      damage: row.damage,
      insurance: row.insurance,
      financials: row.financials,
      notes: row.notes || [],
      attachments: row.attachments || [],
      actions: row.actions || [],
      tags: row.tags || [],
      inspectionDate: row.inspection_date,
      contractSignedDate: row.contract_signed_date,
      scheduledInstallDate: row.scheduled_install_date,
      completedDate: row.completed_date,
      linkedChatSessionId: row.linked_chat_session_id,
      linkedTranscriptIds: row.linked_transcript_ids || [],
      linkedEmailIds: row.linked_email_ids || [],
      linkedImageAnalysisIds: row.linked_image_analysis_ids || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    res.json({ job });
  } catch (error) {
    console.error('[Jobs API] Error getting job:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// ============ POST /api/jobs - Create new job ============
router.post('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const {
      title,
      status = 'new_lead',
      priority = 'medium',
      leadSource,
      customer,
      property,
      roofDetails,
      damage,
      insurance,
      financials,
      notes = [],
      attachments = [],
      actions = [],
      tags = [],
      inspectionDate,
      contractSignedDate,
      scheduledInstallDate,
    } = req.body;

    // Validation
    if (!customer?.name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    if (!property?.address?.trim()) {
      return res.status(400).json({ error: 'Property address is required' });
    }

    // Generate title if not provided
    const jobTitle = title || `${property.address} - ${customer.name}`;

    const result = await pool.query(
      `INSERT INTO jobs (
        user_id, title, status, priority, lead_source,
        customer, property, roof_details, damage, insurance, financials,
        notes, attachments, actions, tags,
        inspection_date, contract_signed_date, scheduled_install_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        userId, jobTitle, status, priority, leadSource,
        JSON.stringify(customer), JSON.stringify(property),
        roofDetails ? JSON.stringify(roofDetails) : null,
        damage ? JSON.stringify(damage) : null,
        insurance ? JSON.stringify(insurance) : null,
        financials ? JSON.stringify(financials) : null,
        JSON.stringify(notes), JSON.stringify(attachments),
        JSON.stringify(actions), JSON.stringify(tags),
        inspectionDate || null, contractSignedDate || null, scheduledInstallDate || null
      ]
    );

    const row = result.rows[0];
    const job = {
      id: row.id,
      jobNumber: row.job_number,
      userId: row.user_id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      leadSource: row.lead_source,
      customer: row.customer,
      property: row.property,
      roofDetails: row.roof_details,
      damage: row.damage,
      insurance: row.insurance,
      financials: row.financials,
      notes: row.notes || [],
      attachments: row.attachments || [],
      actions: row.actions || [],
      tags: row.tags || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    console.log('[Jobs API] Created job:', job.jobNumber);
    res.status(201).json({ job });
  } catch (error) {
    console.error('[Jobs API] Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// ============ PUT /api/jobs/:id - Update job ============
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check ownership
    const existing = await pool.query('SELECT user_id FROM jobs WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (existing.rows[0].user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      title,
      status,
      priority,
      leadSource,
      customer,
      property,
      roofDetails,
      damage,
      insurance,
      financials,
      notes,
      attachments,
      actions,
      tags,
      inspectionDate,
      contractSignedDate,
      scheduledInstallDate,
      completedDate,
      linkedChatSessionId,
      linkedTranscriptIds,
      linkedEmailIds,
      linkedImageAnalysisIds,
    } = req.body;

    const result = await pool.query(
      `UPDATE jobs SET
        title = COALESCE($1, title),
        status = COALESCE($2, status),
        priority = COALESCE($3, priority),
        lead_source = COALESCE($4, lead_source),
        customer = COALESCE($5, customer),
        property = COALESCE($6, property),
        roof_details = COALESCE($7, roof_details),
        damage = COALESCE($8, damage),
        insurance = COALESCE($9, insurance),
        financials = COALESCE($10, financials),
        notes = COALESCE($11, notes),
        attachments = COALESCE($12, attachments),
        actions = COALESCE($13, actions),
        tags = COALESCE($14, tags),
        inspection_date = COALESCE($15, inspection_date),
        contract_signed_date = COALESCE($16, contract_signed_date),
        scheduled_install_date = COALESCE($17, scheduled_install_date),
        completed_date = COALESCE($18, completed_date),
        linked_chat_session_id = COALESCE($19, linked_chat_session_id),
        linked_transcript_ids = COALESCE($20, linked_transcript_ids),
        linked_email_ids = COALESCE($21, linked_email_ids),
        linked_image_analysis_ids = COALESCE($22, linked_image_analysis_ids)
      WHERE id = $23
      RETURNING *`,
      [
        title,
        status,
        priority,
        leadSource,
        customer ? JSON.stringify(customer) : null,
        property ? JSON.stringify(property) : null,
        roofDetails ? JSON.stringify(roofDetails) : null,
        damage ? JSON.stringify(damage) : null,
        insurance ? JSON.stringify(insurance) : null,
        financials ? JSON.stringify(financials) : null,
        notes ? JSON.stringify(notes) : null,
        attachments ? JSON.stringify(attachments) : null,
        actions ? JSON.stringify(actions) : null,
        tags ? JSON.stringify(tags) : null,
        inspectionDate,
        contractSignedDate,
        scheduledInstallDate,
        completedDate,
        linkedChatSessionId,
        linkedTranscriptIds ? JSON.stringify(linkedTranscriptIds) : null,
        linkedEmailIds ? JSON.stringify(linkedEmailIds) : null,
        linkedImageAnalysisIds ? JSON.stringify(linkedImageAnalysisIds) : null,
        id
      ]
    );

    const row = result.rows[0];
    const job = {
      id: row.id,
      jobNumber: row.job_number,
      userId: row.user_id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      leadSource: row.lead_source,
      customer: row.customer,
      property: row.property,
      roofDetails: row.roof_details,
      damage: row.damage,
      insurance: row.insurance,
      financials: row.financials,
      notes: row.notes || [],
      attachments: row.attachments || [],
      actions: row.actions || [],
      tags: row.tags || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    console.log('[Jobs API] Updated job:', job.jobNumber);
    res.json({ job });
  } catch (error) {
    console.error('[Jobs API] Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// ============ DELETE /api/jobs/:id - Delete job ============
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check ownership
    const existing = await pool.query('SELECT user_id, job_number FROM jobs WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    if (existing.rows[0].user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM jobs WHERE id = $1', [id]);

    console.log('[Jobs API] Deleted job:', existing.rows[0].job_number);
    res.json({ success: true, deletedJobNumber: existing.rows[0].job_number });
  } catch (error) {
    console.error('[Jobs API] Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// ============ POST /api/jobs/:id/notes - Add note to job ============
router.post('/:id/notes', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { text, type = 'general' } = req.body;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    if (!text?.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user name
    const userResult = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [userId]
    );
    const author = userResult.rows[0]?.name || userEmail.split('@')[0];

    // Get current notes
    const jobResult = await pool.query('SELECT notes FROM jobs WHERE id = $1', [id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const notes = jobResult.rows[0].notes || [];
    const newNote = {
      id: Date.now().toString(),
      text: text.trim(),
      createdAt: new Date().toISOString(),
      author,
      type,
    };
    notes.unshift(newNote);

    await pool.query(
      'UPDATE jobs SET notes = $1 WHERE id = $2',
      [JSON.stringify(notes), id]
    );

    res.status(201).json({ note: newNote });
  } catch (error) {
    console.error('[Jobs API] Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// ============ POST /api/jobs/:id/actions - Add action to job ============
router.post('/:id/actions', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { description, dueDate } = req.body;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    if (!description?.trim()) {
      return res.status(400).json({ error: 'Action description is required' });
    }

    // Get current actions
    const jobResult = await pool.query('SELECT actions FROM jobs WHERE id = $1', [id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const actions = jobResult.rows[0].actions || [];
    const newAction = {
      id: Date.now().toString(),
      description: description.trim(),
      dueDate: dueDate || null,
      completed: false,
    };
    actions.push(newAction);

    await pool.query(
      'UPDATE jobs SET actions = $1 WHERE id = $2',
      [JSON.stringify(actions), id]
    );

    res.status(201).json({ action: newAction });
  } catch (error) {
    console.error('[Jobs API] Error adding action:', error);
    res.status(500).json({ error: 'Failed to add action' });
  }
});

// ============ PATCH /api/jobs/:id/actions/:actionId - Toggle action ============
router.patch('/:id/actions/:actionId', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id, actionId } = req.params;
    const { completed } = req.body;

    // Get current actions
    const jobResult = await pool.query('SELECT actions FROM jobs WHERE id = $1', [id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const actions = jobResult.rows[0].actions || [];
    const actionIndex = actions.findIndex((a: any) => a.id === actionId);
    if (actionIndex === -1) {
      return res.status(404).json({ error: 'Action not found' });
    }

    actions[actionIndex].completed = completed;
    actions[actionIndex].completedAt = completed ? new Date().toISOString() : null;

    await pool.query(
      'UPDATE jobs SET actions = $1 WHERE id = $2',
      [JSON.stringify(actions), id]
    );

    res.json({ action: actions[actionIndex] });
  } catch (error) {
    console.error('[Jobs API] Error toggling action:', error);
    res.status(500).json({ error: 'Failed to toggle action' });
  }
});

// ============ PATCH /api/jobs/:id/status - Quick status update ============
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { status } = req.body;
    const userEmail = req.headers['x-user-email'] as string;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await pool.query(
      'UPDATE jobs SET status = $1 WHERE id = $2 RETURNING job_number, status',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('[Jobs API] Updated status:', result.rows[0].job_number, '->', status);
    res.json({ success: true, jobNumber: result.rows[0].job_number, status });
  } catch (error) {
    console.error('[Jobs API] Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ============ GET /api/jobs/stats - Get job statistics ============
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const pool = getPool(req);
    const userEmail = req.headers['x-user-email'] as string;

    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }

    const userId = await getUserIdFromEmail(pool, userEmail);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = userCheck.rows[0]?.role === 'admin';

    const userFilter = isAdmin ? '' : 'WHERE user_id = $1';
    const params = isAdmin ? [] : [userId];

    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('new_lead', 'contacted', 'inspection_scheduled', 'inspection_complete', 'estimate_sent', 'follow_up', 'contract_signed', 'insurance_filed', 'adjuster_scheduled', 'adjuster_complete', 'supplement_requested', 'approved', 'materials_ordered', 'scheduled', 'in_progress')) as active,
        COUNT(*) FILTER (WHERE status IN ('complete', 'invoiced', 'paid')) as won,
        COUNT(*) FILTER (WHERE status IN ('lost', 'cancelled')) as lost,
        COUNT(*) FILTER (WHERE status IN ('new_lead', 'follow_up', 'supplement_requested')) as needs_action,
        COALESCE(SUM((financials->>'estimateAmount')::numeric), 0) as total_value
      FROM jobs
      ${userFilter}
    `, params);

    const stats = result.rows[0];

    res.json({
      total: parseInt(stats.total),
      active: parseInt(stats.active),
      won: parseInt(stats.won),
      lost: parseInt(stats.lost),
      needsAction: parseInt(stats.needs_action),
      totalValue: parseFloat(stats.total_value) || 0,
    });
  } catch (error) {
    console.error('[Jobs API] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
