/**
 * Susan Tool Service
 * Defines Gemini function declarations and server-side executors for Susan's
 * agentic capabilities. Each tool accepts a ToolContext containing the
 * authenticated user and a live PostgreSQL pool.
 *
 * Tool list:
 *   1. schedule_followup      – Create a task/reminder (stub until agent_tasks exists)
 *   2. lookup_hail_data        – IHM hail history via hailMapsService
 *   3. save_client_note        – UPSERT into user_memory table
 *   4. draft_email             – Return structured email metadata for Gemini to fill
 *   5. share_team_intel        – INSERT into agent_network_messages (pending admin approval)
 *   6. get_job_details         – SELECT from jobs table by job_number
 *   7. search_knowledge_base   – Full-text search of knowledge_documents table
 */

import pg from 'pg';
import { Type, type FunctionDeclaration } from '@google/genai';
import { hailMapsService } from './hailMapsService.js';
import { createCalendarEvent, checkAvailability, listCalendarEvents } from './googleCalendarService.js';
import { sendGmailEmail } from './googleGmailService.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ToolContext {
  userId: string;
  userEmail: string;
  userName: string;
  /** Two-letter state abbreviation, e.g. "TX" – derived from user profile */
  userState: string;
  pool: pg.Pool;
}

export interface ToolResult {
  name: string;
  result: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tool 1: schedule_followup
// ---------------------------------------------------------------------------

const scheduleFollowupDeclaration: FunctionDeclaration = {
  name: 'schedule_followup',
  description:
    'Create a follow-up task or reminder for the rep. Use when the rep says they need to call someone back, set a reminder, or schedule a check-in.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      contact_name: {
        type: Type.STRING,
        description: 'Full name of the contact or homeowner to follow up with.'
      },
      contact_phone: {
        type: Type.STRING,
        description: 'Phone number of the contact (optional).'
      },
      due_date: {
        type: Type.STRING,
        description:
          'ISO 8601 date string for when the follow-up is due, e.g. "2026-03-01". Use relative terms like "tomorrow" or "next Monday" if an exact date is not specified.'
      },
      note: {
        type: Type.STRING,
        description: 'Short note describing what to follow up on.'
      },
      priority: {
        type: Type.STRING,
        description: 'Priority level: "low", "medium", or "high". Defaults to "medium".'
      },
      create_calendar_event: {
        type: Type.BOOLEAN,
        description: 'If true, also create a Google Calendar event for this follow-up (requires connected Google account). Default false.'
      }
    },
    required: ['contact_name', 'note']
  }
};

async function executeScheduleFollowup(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { contact_name, contact_phone, due_date, note, priority = 'medium', create_calendar_event: syncCal } = args as {
    contact_name: string;
    contact_phone?: string;
    due_date?: string;
    note: string;
    priority?: string;
    create_calendar_event?: boolean;
  };

  // Parse due_date or default to tomorrow 9 AM
  let dueAt: Date;
  if (due_date) {
    dueAt = new Date(due_date);
    if (isNaN(dueAt.getTime())) {
      // Try relative parsing: "Thursday 10am" etc — fallback to tomorrow
      dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      dueAt.setHours(9, 0, 0, 0);
    }
  } else {
    dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dueAt.setHours(9, 0, 0, 0);
  }

  const title = `Follow up with ${contact_name}`;
  const description = [note, contact_phone ? `Phone: ${contact_phone}` : ''].filter(Boolean).join(' | ');

  try {
    const result = await ctx.pool.query(
      `INSERT INTO agent_tasks (user_id, title, description, task_type, due_at, priority, metadata)
       VALUES ($1, $2, $3, 'followup', $4, $5, $6)
       RETURNING id, title, due_at, priority`,
      [
        ctx.userId,
        title,
        description || null,
        dueAt.toISOString(),
        priority,
        JSON.stringify({ contact_name, contact_phone: contact_phone || null }),
      ]
    );

    const task = result.rows[0];
    console.log(`[SusanTool:schedule_followup] Created task ${task.id} for user ${ctx.userId}`);

    // Optionally sync to Google Calendar
    let calendarLink: string | null = null;
    if (syncCal) {
      try {
        const calResult = await createCalendarEvent(ctx.pool, ctx.userId, {
          summary: title,
          startTime: dueAt.toISOString(),
          description: description || note,
        });
        if (calResult.success) {
          calendarLink = calResult.htmlLink || null;
        }
      } catch (calErr) {
        console.warn('[SusanTool:schedule_followup] Calendar sync failed:', (calErr as Error).message);
      }
    }

    return {
      success: true,
      message: `Follow-up scheduled: "${title}" due ${dueAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` +
        (calendarLink ? ` (also added to Google Calendar)` : ''),
      task: {
        id: task.id,
        title: task.title,
        due_at: task.due_at,
        priority: task.priority,
      },
      ...(calendarLink ? { calendar_event_link: calendarLink } : {}),
    };
  } catch (err) {
    // Table may not exist yet (pre-migration) — fall back to stub
    console.warn('[SusanTool:schedule_followup] DB write failed, returning stub:', (err as Error).message);
    return {
      success: true,
      stub: true,
      message: `Follow-up with ${contact_name} noted. (Task will be persisted after migration runs.)`,
      task: { contact_name, due_date: dueAt.toISOString(), note, priority },
    };
  }
}

// ---------------------------------------------------------------------------
// Tool 2: lookup_hail_data
// ---------------------------------------------------------------------------

const lookupHailDataDeclaration: FunctionDeclaration = {
  name: 'lookup_hail_data',
  description:
    'Search IHM (Interactive Hail Maps) hail history for a specific address. Returns hail and wind events with dates, sizes, and severity. Use when the rep or a homeowner asks about storm history at a property.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      street: {
        type: Type.STRING,
        description: 'Street address, e.g. "1234 Oak Lane".'
      },
      city: {
        type: Type.STRING,
        description: 'City name.'
      },
      state: {
        type: Type.STRING,
        description: 'Two-letter US state abbreviation, e.g. "TX".'
      },
      zip: {
        type: Type.STRING,
        description: 'Five-digit ZIP code.'
      },
      months: {
        type: Type.NUMBER,
        description: 'How many months of history to retrieve. Defaults to 24.'
      }
    },
    required: ['street', 'city', 'state', 'zip']
  }
};

async function executeLookupHailData(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { street, city, state, zip, months = 24 } = args as {
    street: string;
    city: string;
    state: string;
    zip: string;
    months?: number;
  };

  if (!hailMapsService.isConfigured()) {
    return {
      success: false,
      error: 'IHM API credentials are not configured on this server. Cannot retrieve hail data.',
      address: { street, city, state, zip }
    };
  }

  try {
    const result = await hailMapsService.searchByAddress({ street, city, state, zip }, months);

    // Trim the raw field to keep the response compact for Gemini context
    const events = (result.events ?? []).map(({ raw: _raw, ...e }) => e);
    const noaaEvents = (result.noaaEvents ?? []).slice(0, 10);
    const windEvents = (result.windEvents ?? []).slice(0, 10);

    return {
      success: true,
      address: `${street}, ${city}, ${state} ${zip}`,
      months_searched: months,
      total_hail_events: result.totalCount,
      hail_events: events.slice(0, 20),
      wind_events: windEvents,
      noaa_events: noaaEvents,
      search_area: result.searchArea
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SusanTool:lookup_hail_data] Error:', message);
    return {
      success: false,
      error: `Failed to retrieve hail data: ${message}`,
      address: { street, city, state, zip }
    };
  }
}

// ---------------------------------------------------------------------------
// Tool 3: save_client_note
// ---------------------------------------------------------------------------

const saveClientNoteDeclaration: FunctionDeclaration = {
  name: 'save_client_note',
  description:
    'Persist a note about a client or property to the rep\'s memory. Use when important information is shared about a homeowner, insurer, adjuster, or claim that should be remembered for future conversations.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description:
          'Category for the note, e.g. "homeowner", "insurer", "adjuster", "property", "claim", "custom".'
      },
      key: {
        type: Type.STRING,
        description:
          'Short key identifying what is being remembered, e.g. "preferred_contact_time", "deductible_amount", "adjuster_name".'
      },
      value: {
        type: Type.STRING,
        description: 'The actual note or value to store.'
      },
      memory_type: {
        type: Type.STRING,
        description:
          'Memory type: "client" for homeowner/claim data, "preference" for rep preferences, "intel" for market intelligence. Defaults to "client".'
      },
      confidence: {
        type: Type.NUMBER,
        description:
          'Confidence score 0–1 indicating how reliable this information is. Defaults to 0.9 for things the user stated directly.'
      }
    },
    required: ['category', 'key', 'value']
  }
};

async function executeSaveClientNote(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const {
    category,
    key,
    value,
    memory_type = 'client',
    confidence = 0.9
  } = args as {
    category: string;
    key: string;
    value: string;
    memory_type?: string;
    confidence?: number;
  };

  try {
    const result = await ctx.pool.query(
      `INSERT INTO user_memory (user_id, memory_type, category, key, value, confidence, source_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, memory_type, category, key)
       DO UPDATE SET
         value = CASE
           WHEN EXCLUDED.confidence >= user_memory.confidence
           THEN EXCLUDED.value
           ELSE user_memory.value
         END,
         confidence = GREATEST(EXCLUDED.confidence, user_memory.confidence),
         times_referenced = user_memory.times_referenced + 1,
         last_updated = CURRENT_TIMESTAMP
       RETURNING id, memory_type, category, key, value, confidence, last_updated`,
      [ctx.userId, memory_type, category, key, value, confidence, 'susan_agent']
    );

    const saved = result.rows[0];
    console.log(
      `[SusanTool:save_client_note] Saved memory id=${saved?.id} user=${ctx.userEmail} ${category}/${key}`
    );

    return {
      success: true,
      message: `Note saved: "${key}" in category "${category}".`,
      saved: saved ?? null
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SusanTool:save_client_note] Error:', message);
    return {
      success: false,
      error: `Failed to save note: ${message}`
    };
  }
}

// ---------------------------------------------------------------------------
// Tool 4: draft_email
// ---------------------------------------------------------------------------

const draftEmailDeclaration: FunctionDeclaration = {
  name: 'draft_email',
  description:
    'Return structured metadata for an email Susan should draft. The actual email content will be written by Susan in her response. Use when the rep asks Susan to write, draft, or compose an email.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      recipient_type: {
        type: Type.STRING,
        description:
          'Who the email is addressed to: "homeowner", "adjuster", "public_adjuster", "insurance_carrier", "mortgage_company", "contractor", "other".'
      },
      recipient_name: {
        type: Type.STRING,
        description: 'Full name of the recipient (if known).'
      },
      recipient_email: {
        type: Type.STRING,
        description: 'Email address of the recipient (if known).'
      },
      tone: {
        type: Type.STRING,
        description:
          'Tone of the email: "professional", "friendly", "firm", "urgent", "follow_up". Defaults to "professional".'
      },
      subject: {
        type: Type.STRING,
        description: 'Proposed email subject line.'
      },
      key_points: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of key points or topics the email should cover.'
      },
      state: {
        type: Type.STRING,
        description: 'US state abbreviation relevant to this email, if applicable.'
      },
      insurer: {
        type: Type.STRING,
        description: 'Name of the insurance company, if relevant.'
      },
      send_immediately: {
        type: Type.BOOLEAN,
        description: 'If true AND the rep has connected Gmail, send the email right away instead of just drafting it. Default false.'
      }
    },
    required: ['recipient_type', 'subject', 'key_points']
  }
};

async function executeDraftEmail(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const {
    recipient_type,
    recipient_name,
    recipient_email,
    tone = 'professional',
    subject,
    key_points,
    state,
    insurer,
    send_immediately
  } = args as {
    recipient_type: string;
    recipient_name?: string;
    recipient_email?: string;
    tone?: string;
    subject: string;
    key_points: string[];
    state?: string;
    insurer?: string;
    send_immediately?: boolean;
  };

  console.log(
    `[SusanTool:draft_email] user=${ctx.userEmail} recipient_type=${recipient_type} subject="${subject}"`
  );

  // If send_immediately AND we have a recipient email, try Gmail
  if (send_immediately && recipient_email) {
    const gmailResult = await sendGmailEmail(ctx.pool, ctx.userId, {
      to: recipient_email,
      subject,
      body: `<p>${(Array.isArray(key_points) ? key_points : [key_points]).join('</p><p>')}</p>`,
    });
    if (gmailResult.success) {
      return {
        success: true,
        state: 'sent_via_gmail',
        message: `Email sent to ${recipient_email} via Gmail.`,
        messageId: gmailResult.messageId,
        metadata: { recipient_type, recipient_email, subject, tone }
      };
    }
    // If Gmail not connected, fall through to metadata-only
    if (gmailResult.error?.includes('not connected')) {
      console.log('[SusanTool:draft_email] Gmail not connected, falling back to metadata-only');
    }
  }

  // Return structured metadata; Susan's LLM response will contain the actual email body
  return {
    success: true,
    state: 'metadata_ready',
    instruction:
      'Email metadata captured. Write the full email body in your response text using the key_points as the outline.' +
      (send_immediately ? ' Note: To send emails directly, the rep needs to connect their Google account in Profile settings.' : ''),
    metadata: {
      recipient_type,
      recipient_name: recipient_name ?? null,
      recipient_email: recipient_email ?? null,
      tone,
      subject,
      key_points: Array.isArray(key_points) ? key_points : [key_points],
      state: state ?? ctx.userState ?? null,
      insurer: insurer ?? null,
      drafted_for: ctx.userEmail
    }
  };
}

// ---------------------------------------------------------------------------
// Tool 5: share_team_intel
// ---------------------------------------------------------------------------

const shareTeamIntelDeclaration: FunctionDeclaration = {
  name: 'share_team_intel',
  description:
    'Share a piece of market intelligence or field insight with the team. Use when the rep mentions something valuable others should know – insurer tricks, adjuster names, state-specific tips, etc.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      intel_type: {
        type: Type.STRING,
        description:
          'Type of intel: "insurer_tactic", "adjuster_behavior", "state_tip", "supplement_win", "claim_process", "general".'
      },
      content: {
        type: Type.STRING,
        description: 'The actual intelligence content to share with the team.'
      },
      state: {
        type: Type.STRING,
        description: 'US state abbreviation this intel applies to (optional).'
      },
      insurer: {
        type: Type.STRING,
        description: 'Insurance company this intel relates to (optional).'
      }
    },
    required: ['intel_type', 'content']
  }
};

async function executeShareTeamIntel(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { intel_type, content, state, insurer } = args as {
    intel_type: string;
    content: string;
    state?: string;
    insurer?: string;
  };

  try {
    const result = await ctx.pool.query(
      `INSERT INTO agent_network_messages (author_user_id, intel_type, content, state, insurer)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, intel_type, content, state, insurer, status, created_at`,
      [
        ctx.userId,
        intel_type,
        content,
        state ?? ctx.userState ?? null,
        insurer ?? null
      ]
    );

    const row = result.rows[0];
    console.log(
      `[SusanTool:share_team_intel] Submitted – id=${row.id} user=${ctx.userEmail} type=${intel_type}`
    );

    return {
      success: true,
      message: 'Intel submitted for team review. An admin will approve it and then it will appear in the Agent Intel feed.',
      intel: {
        id: row.id,
        intel_type: row.intel_type,
        content: row.content,
        state: row.state,
        insurer: row.insurer,
        status: row.status,
        shared_by: ctx.userEmail
      }
    };
  } catch (err) {
    // Table may not exist yet (pre-migration) — fall back to stub
    const msg = (err as Error).message || '';
    if (msg.includes('does not exist')) {
      console.log(
        `[SusanTool:share_team_intel] Stub (table missing) – user=${ctx.userEmail} type=${intel_type}`
      );
      return {
        success: true,
        stub: true,
        message: 'Team intel noted for this session. The agent network feed will be available after the next database migration.',
        intel: { intel_type, content, state: state ?? ctx.userState ?? null, insurer: insurer ?? null, shared_by: ctx.userEmail }
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tool 6: get_job_details
// ---------------------------------------------------------------------------

const getJobDetailsDeclaration: FunctionDeclaration = {
  name: 'get_job_details',
  description:
    'Retrieve full details of a job by job number. Use when the rep references a specific job number or asks about the status, claim info, or customer details for a job.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      job_number: {
        type: Type.STRING,
        description: 'The job number to look up, e.g. "JOB-2026-0042".'
      }
    },
    required: ['job_number']
  }
};

async function executeGetJobDetails(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { job_number } = args as { job_number: string };

  try {
    const result = await ctx.pool.query(
      `SELECT
         id,
         job_number,
         title,
         status,
         priority,
         lead_source,
         customer,
         property,
         roof_details,
         damage,
         insurance,
         financials,
         notes,
         tags,
         inspection_date,
         contract_signed_date,
         scheduled_install_date,
         completed_date,
         created_at,
         updated_at
       FROM jobs
       WHERE job_number = $1
         AND user_id = $2
       LIMIT 1`,
      [job_number, ctx.userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: `No job found with number "${job_number}" for this user.`,
        job_number
      };
    }

    const row = result.rows[0];

    // Parse JSON columns safely
    const parseJson = (v: unknown) => {
      if (v == null) return null;
      if (typeof v === 'object') return v;
      try { return JSON.parse(v as string); } catch { return v; }
    };

    console.log(
      `[SusanTool:get_job_details] Found job=${job_number} user=${ctx.userEmail}`
    );

    return {
      success: true,
      job: {
        id: row.id,
        job_number: row.job_number,
        title: row.title,
        status: row.status,
        priority: row.priority,
        lead_source: row.lead_source,
        customer: parseJson(row.customer),
        property: parseJson(row.property),
        roof_details: parseJson(row.roof_details),
        damage: parseJson(row.damage),
        insurance: parseJson(row.insurance),
        financials: parseJson(row.financials),
        notes: parseJson(row.notes) ?? [],
        tags: parseJson(row.tags) ?? [],
        inspection_date: row.inspection_date,
        contract_signed_date: row.contract_signed_date,
        scheduled_install_date: row.scheduled_install_date,
        completed_date: row.completed_date,
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SusanTool:get_job_details] Error:', message);
    return {
      success: false,
      error: `Failed to retrieve job: ${message}`,
      job_number
    };
  }
}

// ---------------------------------------------------------------------------
// Tool 7: search_knowledge_base
// ---------------------------------------------------------------------------

const searchKnowledgeBaseDeclaration: FunctionDeclaration = {
  name: 'search_knowledge_base',
  description:
    'Search the knowledge base for insurance tactics, claim strategies, product information, or training documents. Use when the rep asks a policy or procedure question that might be answered by internal documents.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query – keywords, phrases, or a question.'
      },
      limit: {
        type: Type.NUMBER,
        description: 'Maximum number of results to return. Defaults to 5.'
      }
    },
    required: ['query']
  }
};

async function executeSearchKnowledgeBase(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { query, limit = 5 } = args as { query: string; limit?: number };

  const safeLimit = Math.min(Math.max(1, Number(limit) || 5), 20);

  try {
    const result = await ctx.pool.query(
      `SELECT name, category, content
       FROM knowledge_documents
       WHERE content ILIKE '%' || $1 || '%'
          OR name    ILIKE '%' || $1 || '%'
       LIMIT $2`,
      [query, safeLimit]
    );

    if (result.rows.length === 0) {
      return {
        success: true,
        query,
        results: [],
        message:
          'No matching documents found in the knowledge base. The answer may be in the rep\'s conversation context or frontend RAG index.'
      };
    }

    console.log(
      `[SusanTool:search_knowledge_base] Found ${result.rows.length} docs for query="${query}" user=${ctx.userEmail}`
    );

    return {
      success: true,
      query,
      total_found: result.rows.length,
      results: result.rows.map((r) => ({
        name: r.name,
        category: r.category,
        // Truncate content to keep token usage reasonable
        excerpt: typeof r.content === 'string' ? r.content.slice(0, 600) : null
      }))
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // If the table doesn't exist yet, return a soft fallback rather than 500
    if (message.includes('does not exist') || message.includes('relation')) {
      console.warn('[SusanTool:search_knowledge_base] knowledge_documents table not found, using fallback');
      return {
        success: true,
        query,
        results: [],
        message:
          'Knowledge base table not yet provisioned on this server. RAG search is handled by the frontend context builder.'
      };
    }

    console.error('[SusanTool:search_knowledge_base] Error:', message);
    return {
      success: false,
      error: `Failed to search knowledge base: ${message}`,
      query
    };
  }
}

// ---------------------------------------------------------------------------
// Tool 8: send_email (via Gmail)
// ---------------------------------------------------------------------------

const sendEmailDeclaration: FunctionDeclaration = {
  name: 'send_email',
  description:
    "Send an email via the rep's connected Gmail account. Use when the rep asks to send, email, or forward something to someone. If the rep has not connected their Google account, return instructions to do so.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      to: { type: Type.STRING, description: 'Recipient email address.' },
      subject: { type: Type.STRING, description: 'Email subject line.' },
      body: { type: Type.STRING, description: 'Full HTML email body content. Write the complete email.' },
      cc: { type: Type.STRING, description: 'CC email address (optional).' }
    },
    required: ['to', 'subject', 'body']
  }
};

async function executeSendEmail(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { to, subject, body, cc } = args as {
    to: string; subject: string; body: string; cc?: string;
  };

  const result = await sendGmailEmail(ctx.pool, ctx.userId, { to, subject, body, cc });

  if (!result.success && result.error?.includes('not connected')) {
    return {
      success: false,
      google_not_connected: true,
      message: 'To send emails directly, connect your Google account in Profile settings. Here is the email draft for you to copy:',
      draft: { to, subject, body, cc }
    };
  }

  if (!result.success) {
    return { success: false, error: result.error };
  }

  console.log(`[SusanTool:send_email] Sent to=${to} msgId=${result.messageId} user=${ctx.userEmail}`);
  return {
    success: true,
    message: `Email sent to ${to} via Gmail.`,
    messageId: result.messageId,
    threadId: result.threadId
  };
}

// ---------------------------------------------------------------------------
// Tool 9: create_calendar_event
// ---------------------------------------------------------------------------

const createCalendarEventDeclaration: FunctionDeclaration = {
  name: 'create_calendar_event',
  description:
    "Create a Google Calendar event on the rep's calendar. Use when the rep says to schedule a meeting, appointment, or event. Requires connected Google account.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING, description: 'Event title/summary, e.g. "Meeting with Mrs. Johnson".' },
      start_time: { type: Type.STRING, description: 'Start time as ISO 8601 string, e.g. "2026-02-26T14:00:00".' },
      end_time: { type: Type.STRING, description: 'End time as ISO 8601 (optional, defaults to +1 hour).' },
      description: { type: Type.STRING, description: 'Event description or notes (optional).' },
      location: { type: Type.STRING, description: 'Event location, e.g. "123 Main St, Roanoke VA" (optional).' },
      attendee_emails: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Email addresses to invite (optional).'
      }
    },
    required: ['summary', 'start_time']
  }
};

async function executeCreateCalendarEvent(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { summary, start_time, end_time, description, location, attendee_emails } = args as {
    summary: string; start_time: string; end_time?: string; description?: string;
    location?: string; attendee_emails?: string[];
  };

  const result = await createCalendarEvent(ctx.pool, ctx.userId, {
    summary,
    startTime: start_time,
    endTime: end_time,
    description,
    location,
    attendeeEmails: attendee_emails,
  });

  if (!result.success && result.error?.includes('not connected')) {
    // Fallback: create an agent_task instead
    try {
      const dueAt = new Date(start_time);
      await ctx.pool.query(
        `INSERT INTO agent_tasks (user_id, title, description, task_type, due_at, priority)
         VALUES ($1, $2, $3, 'event', $4, 'medium')`,
        [ctx.userId, summary, description || location || null, dueAt.toISOString()]
      );
    } catch { /* best-effort fallback */ }

    return {
      success: false,
      google_not_connected: true,
      message: `To create real calendar events, connect your Google account in Profile settings. I've saved "${summary}" as a task/reminder instead.`
    };
  }

  if (!result.success) {
    return { success: false, error: result.error };
  }

  console.log(`[SusanTool:create_calendar_event] Created event="${summary}" for user=${ctx.userEmail}`);
  return {
    success: true,
    message: `Calendar event created: "${summary}"`,
    eventId: result.eventId,
    eventLink: result.htmlLink
  };
}

// ---------------------------------------------------------------------------
// Tool 10: check_availability
// ---------------------------------------------------------------------------

const checkAvailabilityDeclaration: FunctionDeclaration = {
  name: 'check_availability',
  description:
    "Check the rep's Google Calendar for availability during a time range. Use when the rep asks if they are free at a certain time or wants to find an open slot.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      start_time: { type: Type.STRING, description: 'Start of time range (ISO 8601).' },
      end_time: { type: Type.STRING, description: 'End of time range (ISO 8601).' }
    },
    required: ['start_time', 'end_time']
  }
};

async function executeCheckAvailability(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { start_time, end_time } = args as { start_time: string; end_time: string };

  const result = await checkAvailability(ctx.pool, ctx.userId, {
    startTime: start_time,
    endTime: end_time,
  });

  if (!result.success && result.error?.includes('not connected')) {
    return {
      success: false,
      google_not_connected: true,
      message: "I can't check your calendar without a connected Google account. Connect in Profile settings."
    };
  }

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    busy: result.busy,
    busySlots: result.busySlots,
    message: result.busy
      ? `You have ${result.busySlots?.length} event(s) during that time.`
      : 'You are free during that time range.'
  };
}

// ---------------------------------------------------------------------------
// Tool 11: fetch_calendar_events
// ---------------------------------------------------------------------------

const fetchCalendarEventsDeclaration: FunctionDeclaration = {
  name: 'fetch_calendar_events',
  description:
    "Fetch the rep's upcoming calendar events. Use when the rep asks what they have scheduled, " +
    "what's on their calendar, or what appointments are coming up.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      start_date: {
        type: Type.STRING,
        description: 'Start date for event search (ISO 8601). Defaults to now.'
      },
      end_date: {
        type: Type.STRING,
        description: 'End date for event search (ISO 8601). Defaults to 7 days from start.'
      },
    },
    required: []
  }
};

async function executeFetchCalendarEvents(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const startDate = (args.start_date as string) || new Date().toISOString();
  const endDate = (args.end_date as string) || new Date(Date.now() + 7 * 86400000).toISOString();
  const events: Array<Record<string, unknown>> = [];

  // Try Google Calendar first
  const googleResult = await listCalendarEvents(ctx.pool, ctx.userId, {
    timeMin: startDate,
    timeMax: endDate,
    maxResults: 20,
  });
  if (googleResult.success && googleResult.events) {
    events.push(...googleResult.events.map(e => ({
      summary: e.summary,
      start: e.start_time,
      end: e.end_time,
      location: e.location || null,
      source: 'google',
    })));
  }

  // Also fetch local events
  try {
    const localResult = await ctx.pool.query(
      `SELECT summary, start_time, end_time, location, event_type
       FROM calendar_events
       WHERE user_id = $1 AND status = 'active'
         AND start_time >= $2 AND start_time <= $3
       ORDER BY start_time LIMIT 20`,
      [ctx.userId, startDate, endDate]
    );
    for (const row of localResult.rows) {
      events.push({
        summary: row.summary,
        start: row.start_time,
        end: row.end_time,
        location: row.location,
        event_type: row.event_type,
        source: 'local',
      });
    }
  } catch { /* table may not exist yet */ }

  events.sort((a, b) => new Date(a.start as string).getTime() - new Date(b.start as string).getTime());

  if (events.length === 0) {
    return {
      success: true,
      events: [],
      message: googleResult.success
        ? 'No events found in that date range.'
        : 'No local events found. Connect Google in Profile settings to see your full calendar.'
    };
  }

  return { success: true, event_count: events.length, events };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Tool 12: send_notification
// ---------------------------------------------------------------------------

const sendNotificationDeclaration: FunctionDeclaration = {
  name: 'send_notification',
  description:
    'Send a push notification to the current user, a specific team member by email, or the entire team. Use for reminders, alerts, or important updates that need immediate attention on their phone.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      recipient: {
        type: Type.STRING,
        description:
          'Who to notify: "self" for current user, "team" for all team members, or an email address for a specific person.'
      },
      title: {
        type: Type.STRING,
        description: 'Notification title (short, under 50 chars).'
      },
      body: {
        type: Type.STRING,
        description: 'Notification body message (1-2 sentences).'
      },
      notification_type: {
        type: Type.STRING,
        description:
          'Type of notification: "reminder", "alert", "update", or "storm_alert". Defaults to "alert".'
      }
    },
    required: ['title', 'body']
  }
};

async function executeSendNotification(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  const { pool } = ctx;
  const title = String(args.title || 'Notification');
  const body = String(args.body || '');
  const recipient = String(args.recipient || 'self').toLowerCase().trim();
  const notificationType = String(args.notification_type || 'alert');

  // Import push service
  const { createPushNotificationService } = await import('./pushNotificationService.js');
  const pushService = createPushNotificationService(pool);

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  if (recipient === 'self') {
    // Send to current user
    const pushResults = await pushService.sendToUser(ctx.userId, {
      title,
      body,
      data: { type: notificationType, source: 'susan' }
    }, notificationType);

    results.push({
      userId: ctx.userId,
      success: pushResults.some(r => r.success),
      error: pushResults.every(r => !r.success) ? pushResults[0]?.error : undefined
    });
  } else if (recipient === 'team') {
    // Send to all active team members
    const teamMembers = await pool.query(
      `SELECT id FROM users WHERE is_active = TRUE`
    );

    for (const member of teamMembers.rows) {
      const pushResults = await pushService.sendToUser(member.id, {
        title,
        body,
        data: { type: notificationType, source: 'susan', senderName: ctx.userName }
      }, notificationType);

      results.push({
        userId: member.id,
        success: pushResults.some(r => r.success),
        error: pushResults.every(r => !r.success) ? pushResults[0]?.error : undefined
      });
    }
  } else {
    // Send to specific user by email
    const targetUser = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
      [recipient]
    );

    if (targetUser.rows.length === 0) {
      return { success: false, error: `No user found with email "${recipient}"` };
    }

    const pushResults = await pushService.sendToUser(targetUser.rows[0].id, {
      title,
      body,
      data: { type: notificationType, source: 'susan', senderName: ctx.userName }
    }, notificationType);

    results.push({
      userId: targetUser.rows[0].id,
      success: pushResults.some(r => r.success),
      error: pushResults.every(r => !r.success) ? pushResults[0]?.error : undefined
    });
  }

  const totalSent = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;

  console.log(`[SusanTool:send_notification] recipient=${recipient} sent=${totalSent} failed=${totalFailed}`);

  return {
    success: totalSent > 0,
    sent: totalSent,
    failed: totalFailed,
    message: totalSent > 0
      ? `Notification sent to ${totalSent} user${totalSent > 1 ? 's' : ''}.`
      : `Could not deliver notification. ${results[0]?.error || 'Users may not have push notifications enabled.'}`
  };
}

// Public API: SUSAN_TOOLS array + executeTool dispatcher
// ---------------------------------------------------------------------------

/** All Susan function declarations in Gemini format */
export const SUSAN_TOOLS: FunctionDeclaration[] = [
  scheduleFollowupDeclaration,
  lookupHailDataDeclaration,
  saveClientNoteDeclaration,
  draftEmailDeclaration,
  shareTeamIntelDeclaration,
  getJobDetailsDeclaration,
  searchKnowledgeBaseDeclaration,
  sendEmailDeclaration,
  createCalendarEventDeclaration,
  checkAvailabilityDeclaration,
  fetchCalendarEventsDeclaration,
  sendNotificationDeclaration
];

/** Map from tool name to executor for O(1) dispatch */
const TOOL_EXECUTORS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>
> = {
  schedule_followup: executeScheduleFollowup,
  lookup_hail_data: executeLookupHailData,
  save_client_note: executeSaveClientNote,
  draft_email: executeDraftEmail,
  share_team_intel: executeShareTeamIntel,
  get_job_details: executeGetJobDetails,
  search_knowledge_base: executeSearchKnowledgeBase,
  send_email: executeSendEmail,
  create_calendar_event: executeCreateCalendarEvent,
  check_availability: executeCheckAvailability,
  fetch_calendar_events: executeFetchCalendarEvents,
  send_notification: executeSendNotification
};

/**
 * Execute a named tool with the given arguments and user context.
 * Returns a ToolResult regardless of success/failure (errors are surfaced
 * in the result object so Gemini can decide how to respond).
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS[name];

  if (!executor) {
    console.warn(`[SusanTool:executeTool] Unknown tool requested: "${name}"`);
    return {
      name,
      result: {
        success: false,
        error: `Unknown tool "${name}". Available tools: ${Object.keys(TOOL_EXECUTORS).join(', ')}.`
      }
    };
  }

  try {
    const result = await executor(args, ctx);
    return { name, result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SusanTool:executeTool] Unhandled error in "${name}":`, message);
    return {
      name,
      result: {
        success: false,
        error: `Tool "${name}" encountered an unexpected error: ${message}`
      }
    };
  }
}
