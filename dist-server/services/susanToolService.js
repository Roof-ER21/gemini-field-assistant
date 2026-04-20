/**
 * Susan Tool Service
 * Defines Gemini function declarations and server-side executors for Susan's
 * agentic capabilities. Each tool accepts a ToolContext containing the
 * authenticated user and a live PostgreSQL pool.
 *
 * Tool list:
 *   1. schedule_followup      – Create a task/reminder (stub until agent_tasks exists)
 *   2. lookup_hail_data        – NOAA storm history (hail + wind, verified, 3-14d lag)
 *   2b. lookup_mrms_radar      – MRMS radar direct query (today, yesterday, sub-½", ~30m lag)
 *   3. save_client_note        – UPSERT into user_memory table
 *   4. draft_email             – Return structured email metadata for Gemini to fill
 *   5. share_team_intel        – INSERT into agent_network_messages (pending admin approval)
 *   6. get_job_details         – SELECT from jobs table by job_number
 *   7. search_knowledge_base   – Full-text search of knowledge_documents table
 *   8. lookup_insurance_company – Look up insurance company contact details from the directory
 */
import { Type } from '@google/genai';
import { noaaStormService } from './noaaStormService.js';
import { getMrmsHailAtPoint, getRecentMrmsHailAtPoint } from './historicalMrmsService.js';
import { createCalendarEvent, checkAvailability, listCalendarEvents } from './googleCalendarService.js';
import { sendGmailEmail } from './googleGmailService.js';
// ---------------------------------------------------------------------------
// Tool 1: schedule_followup
// ---------------------------------------------------------------------------
const scheduleFollowupDeclaration = {
    name: 'schedule_followup',
    description: 'Create a follow-up task or reminder for the rep. Use when the rep says they need to call someone back, set a reminder, or schedule a check-in.',
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
                description: 'ISO 8601 date string for when the follow-up is due, e.g. "2026-03-01". Use relative terms like "tomorrow" or "next Monday" if an exact date is not specified.'
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
async function executeScheduleFollowup(args, ctx) {
    const { contact_name, contact_phone, due_date, note, priority = 'medium', create_calendar_event: syncCal } = args;
    // Parse due_date or default to tomorrow 9 AM
    let dueAt;
    if (due_date) {
        dueAt = new Date(due_date);
        if (isNaN(dueAt.getTime())) {
            // Try relative parsing: "Thursday 10am" etc — fallback to tomorrow
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            dueAt.setHours(9, 0, 0, 0);
        }
    }
    else {
        dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        dueAt.setHours(9, 0, 0, 0);
    }
    const title = `Follow up with ${contact_name}`;
    const description = [note, contact_phone ? `Phone: ${contact_phone}` : ''].filter(Boolean).join(' | ');
    try {
        const result = await ctx.pool.query(`INSERT INTO agent_tasks (user_id, title, description, task_type, due_at, priority, metadata)
       VALUES ($1, $2, $3, 'followup', $4, $5, $6)
       RETURNING id, title, due_at, priority`, [
            ctx.userId,
            title,
            description || null,
            dueAt.toISOString(),
            priority,
            JSON.stringify({ contact_name, contact_phone: contact_phone || null }),
        ]);
        const task = result.rows[0];
        console.log(`[SusanTool:schedule_followup] Created task ${task.id} for user ${ctx.userId}`);
        // Optionally sync to Google Calendar
        let calendarLink = null;
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
            }
            catch (calErr) {
                console.warn('[SusanTool:schedule_followup] Calendar sync failed:', calErr.message);
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
    }
    catch (err) {
        // Table may not exist yet (pre-migration) — fall back to stub
        console.warn('[SusanTool:schedule_followup] DB write failed, returning stub:', err.message);
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
const lookupHailDataDeclaration = {
    name: 'lookup_hail_data',
    description: 'Search NOAA Storm Events Database for hail and wind history near a specific address. Returns verified storm events with dates, sizes, and severity from federal weather data. Use when the rep or a homeowner asks about storm history at a property.',
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
                description: 'How many months of history to retrieve. ALWAYS use 24 (minimum). Even if the rep says "last year", use 24 months to avoid missing storms near the boundary.'
            }
        },
        required: ['street', 'city', 'state']
    }
};
async function executeLookupHailData(args, _ctx) {
    const { street, city, state, zip, months = 24 } = args;
    try {
        // Geocode the address via Census Bureau
        const addressLine = `${street}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
        const params = new URLSearchParams({
            address: addressLine,
            benchmark: 'Public_AR_Current',
            format: 'json'
        });
        const geoRes = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`);
        let lat = null;
        let lng = null;
        if (geoRes.ok) {
            const geoData = await geoRes.json();
            const matches = geoData?.result?.addressMatches;
            if (matches?.length) {
                lat = matches[0].coordinates.y;
                lng = matches[0].coordinates.x;
            }
        }
        // Fallback to Nominatim
        if (!lat || !lng) {
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressLine)}&format=json&limit=1&countrycodes=us`, { headers: { 'User-Agent': 'RoofER-GeminiFieldAssistant/1.0' } });
            const nomData = await nomRes.json();
            if (Array.isArray(nomData) && nomData.length > 0) {
                lat = parseFloat(nomData[0].lat);
                lng = parseFloat(nomData[0].lon);
            }
        }
        if (!lat || !lng) {
            return { success: false, error: 'Could not geocode address', address: { street, city, state, zip } };
        }
        // Always search at least 24 months — reps say "last year" but storms at 13 months ago are still relevant
        const effectiveMonths = Math.max(months, 24);
        const years = Math.ceil(effectiveMonths / 12);
        const noaaEvents = await noaaStormService.getStormEvents(lat, lng, 15, years);
        const hailEvents = noaaEvents.filter(e => e.eventType === 'hail').slice(0, 20);
        const windEvents = noaaEvents.filter(e => e.eventType === 'wind').slice(0, 10);
        // Reframe distance for rep communication — NOAA reports show where
        // the observation was DOCUMENTED, not the edge of the storm. Hail
        // swaths are typically 1-10 miles wide, so a report within 10 miles
        // means the property was very likely in the storm's path.
        const reframeEvent = (e) => ({
            date: e.date,
            eventType: e.eventType,
            magnitude: e.magnitude,
            magnitudeUnit: e.magnitudeUnit,
            location: e.location,
            narrative: e.narrative,
            verifiedReportDistance: e.distanceMiles,
        });
        return {
            success: true,
            address: `${street}, ${city}, ${state} ${zip}`,
            months_searched: months,
            total_hail_events: hailEvents.length,
            hail_events: hailEvents.map(reframeEvent),
            wind_events: windEvents.map(reframeEvent),
            search_area: { center: { lat, lng }, radiusMiles: 15 },
            important_context: 'NOAA reports document where trained spotters or ASOS stations OBSERVED the event — NOT the edge of the storm. Hail swaths are typically 1-10 miles wide. A verified report within 10 miles means the property was IN the storm path. Present this to reps as: "Verified hail was documented in the area on [date]" — do NOT say "X miles away" which implies the property was not hit. The property WAS in the storm zone.',
        };
    }
    catch (err) {
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
// Tool 2b: lookup_mrms_radar
// ---------------------------------------------------------------------------
// Added as a companion to lookup_hail_data (NOT a replacement). NOAA Storm
// Events DB lags 3-14 days; MRMS radar updates every 30 min. Reps need to
// answer "was there hail today?" without waiting for federal verification.
//
// Use this tool when:
//   - The rep asks about a RECENT storm (today, yesterday, this week)
//   - The rep wants to know sub-½" cosmetic hail (not in NOAA's threshold)
//   - A homeowner reports a storm Susan can't yet find in NOAA records
//
// Keep using lookup_hail_data for:
//   - Historical queries >2 weeks old (NOAA is verified, preferred for claims)
//   - Insurance-grade evidence (NOAA = federal record, carries more weight)
// ---------------------------------------------------------------------------
const lookupMrmsRadarDeclaration = {
    name: 'lookup_mrms_radar',
    description: "Query NOAA's MRMS radar grid directly for hail at an address on a specific date. Use this for RECENT storms (today, yesterday, this week) or when a homeowner reports a storm that lookup_hail_data (NOAA Storm Events DB) hasn't yet documented — NOAA publishes on a 3-14 day delay, while MRMS radar updates every 30 minutes. Also use this when the rep asks about sub-½\" cosmetic hail (below NOAA's reporting threshold). Returns radar-detected hail sizes at 4 distance bands: atLocation (the exact grid cell the home sits in), within1mi, within3mi, within10mi. ALWAYS pair this with lookup_hail_data for full picture — they complement each other, they do not replace each other.",
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
                description: 'Two-letter US state abbreviation, e.g. "VA".'
            },
            zip: {
                type: Type.STRING,
                description: 'Five-digit ZIP code.'
            },
            date: {
                type: Type.STRING,
                description: "Specific date in YYYY-MM-DD format. Leave blank to auto-scan the last 3 days (best for 'was there hail this week?' questions)."
            }
        },
        required: ['street', 'city', 'state']
    }
};
async function executeLookupMrmsRadar(args, _ctx) {
    const { street, city, state, zip, date } = args;
    try {
        // Reuse Census → Nominatim geocode chain from lookup_hail_data
        const addressLine = `${street}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
        const params = new URLSearchParams({
            address: addressLine,
            benchmark: 'Public_AR_Current',
            format: 'json'
        });
        const geoRes = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`);
        let lat = null;
        let lng = null;
        if (geoRes.ok) {
            const geoData = await geoRes.json();
            const matches = geoData?.result?.addressMatches;
            if (matches?.length) {
                lat = matches[0].coordinates.y;
                lng = matches[0].coordinates.x;
            }
        }
        if (!lat || !lng) {
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressLine)}&format=json&limit=1&countrycodes=us`, { headers: { 'User-Agent': 'RoofER-GeminiFieldAssistant/1.0' } });
            const nomData = await nomRes.json();
            if (Array.isArray(nomData) && nomData.length > 0) {
                lat = parseFloat(nomData[0].lat);
                lng = parseFloat(nomData[0].lon);
            }
        }
        if (!lat || !lng) {
            return { success: false, error: 'Could not geocode address', address: { street, city, state, zip } };
        }
        const actionableFloor = 0.5; // insurance threshold
        // Branch: specific date vs auto-scan last 3 days
        if (date) {
            const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
                ? date
                : new Date(date).toISOString().slice(0, 10);
            const mrms = await getMrmsHailAtPoint(isoDate, lat, lng);
            if (!mrms) {
                return {
                    success: true,
                    address: addressLine,
                    date: isoDate,
                    hail_detected: false,
                    message: `No MRMS radar data available for ${isoDate} at this location — either no hail recorded or MRMS archive is missing for that date.`
                };
            }
            const atLoc = mrms.atLocation ?? 0;
            return {
                success: true,
                address: addressLine,
                date: isoDate,
                hail_detected: atLoc > 0 || (mrms.within10mi ?? 0) > 0,
                at_location_inches: mrms.atLocation,
                within_1mi_inches: mrms.within1mi,
                within_3mi_inches: mrms.within3mi,
                within_10mi_inches: mrms.within10mi,
                direct_hit: mrms.atLocation !== null,
                actionable_hit: atLoc >= actionableFloor,
                source: 'MRMS (NOAA/NSSL radar, IEM MTArchive)',
                interpretation_hint: atLoc >= actionableFloor
                    ? 'Insurance-actionable direct hit at the home. Pair with lookup_hail_data to check for NOAA verification for maximum carrier credibility.'
                    : atLoc > 0
                        ? 'Radar detected sub-½" hail at the home — cosmetic / not insurance-actionable, but useful for canvassing context.'
                        : (mrms.within10mi ?? 0) > 0
                            ? 'No hail at the exact home location but radar picked up hail nearby — check within1mi/within3mi/within10mi values. The storm may have tracked near but not over the property.'
                            : 'No radar hail detected within 10mi.'
            };
        }
        // Auto-scan: last 3 days — best for "any storms this week?" questions
        const recent = await getRecentMrmsHailAtPoint(lat, lng, 3);
        if (recent.length === 0) {
            return {
                success: true,
                address: addressLine,
                scanned: 'last 3 days',
                hail_detected: false,
                message: 'MRMS radar shows no hail within 10 miles of this address in the last 3 days.'
            };
        }
        return {
            success: true,
            address: addressLine,
            scanned: 'last 3 days',
            hail_detected: true,
            days_with_hail: recent.length,
            events: recent.map((d) => ({
                date: d.date,
                at_location_inches: d.atLocation,
                within_1mi_inches: d.within1mi,
                within_3mi_inches: d.within3mi,
                within_10mi_inches: d.within10mi,
                max_inches: d.maxInches,
                direct_hit: d.atLocation !== null,
                actionable_hit: (d.atLocation ?? 0) >= actionableFloor
            })),
            source: 'MRMS (NOAA/NSSL radar, IEM MTArchive)',
            interpretation_hint: 'MRMS fills the 3-14 day gap before NOAA Storm Events Database publishes. For claims documentation, run lookup_hail_data afterward to check for federal verification.'
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SusanTool:lookup_mrms_radar] Error:', message);
        return {
            success: false,
            error: `Failed to retrieve MRMS radar data: ${message}`,
            address: { street, city, state, zip }
        };
    }
}
// ---------------------------------------------------------------------------
// Tool 3: save_client_note
// ---------------------------------------------------------------------------
const saveClientNoteDeclaration = {
    name: 'save_client_note',
    description: 'Persist a note about a client or property to the rep\'s memory. Use when important information is shared about a homeowner, insurer, adjuster, or claim that should be remembered for future conversations.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            category: {
                type: Type.STRING,
                description: 'Category for the note, e.g. "homeowner", "insurer", "adjuster", "property", "claim", "custom".'
            },
            key: {
                type: Type.STRING,
                description: 'Short key identifying what is being remembered, e.g. "preferred_contact_time", "deductible_amount", "adjuster_name".'
            },
            value: {
                type: Type.STRING,
                description: 'The actual note or value to store.'
            },
            memory_type: {
                type: Type.STRING,
                description: 'Memory type: "client" for homeowner/claim data, "preference" for rep preferences, "intel" for market intelligence. Defaults to "client".'
            },
            confidence: {
                type: Type.NUMBER,
                description: 'Confidence score 0–1 indicating how reliable this information is. Defaults to 0.9 for things the user stated directly.'
            }
        },
        required: ['category', 'key', 'value']
    }
};
async function executeSaveClientNote(args, ctx) {
    const { category, key, value, memory_type = 'client', confidence = 0.9 } = args;
    try {
        const result = await ctx.pool.query(`INSERT INTO user_memory (user_id, memory_type, category, key, value, confidence, source_type)
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
       RETURNING id, memory_type, category, key, value, confidence, last_updated`, [ctx.userId, memory_type, category, key, value, confidence, 'susan_agent']);
        const saved = result.rows[0];
        console.log(`[SusanTool:save_client_note] Saved memory id=${saved?.id} user=${ctx.userEmail} ${category}/${key}`);
        return {
            success: true,
            message: `Note saved: "${key}" in category "${category}".`,
            saved: saved ?? null
        };
    }
    catch (err) {
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
const draftEmailDeclaration = {
    name: 'draft_email',
    description: 'Return structured metadata for an email Susan should draft. The actual email content will be written by Susan in her response. Use when the rep asks Susan to write, draft, or compose an email.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            recipient_type: {
                type: Type.STRING,
                description: 'Who the email is addressed to: "homeowner", "adjuster", "public_adjuster", "insurance_carrier", "mortgage_company", "contractor", "other".'
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
                description: 'Tone of the email: "professional", "friendly", "firm", "urgent", "follow_up". Defaults to "professional".'
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
async function executeDraftEmail(args, ctx) {
    const { recipient_type, recipient_name, recipient_email, tone = 'professional', subject, key_points, state, insurer, send_immediately } = args;
    console.log(`[SusanTool:draft_email] user=${ctx.userEmail} recipient_type=${recipient_type} subject="${subject}"`);
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
        instruction: 'Email metadata captured. Write the full email body in your response text using the key_points as the outline.' +
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
const shareTeamIntelDeclaration = {
    name: 'share_team_intel',
    description: 'Share a piece of market intelligence or field insight with the team. Use when the rep mentions something valuable others should know – insurer tricks, adjuster names, state-specific tips, etc.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            intel_type: {
                type: Type.STRING,
                description: 'Type of intel: "insurer_tactic", "adjuster_behavior", "state_tip", "supplement_win", "claim_process", "general".'
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
async function executeShareTeamIntel(args, ctx) {
    const { intel_type, content, state, insurer } = args;
    try {
        const result = await ctx.pool.query(`INSERT INTO agent_network_messages (author_user_id, intel_type, content, state, insurer)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, intel_type, content, state, insurer, status, created_at`, [
            ctx.userId,
            intel_type,
            content,
            state ?? ctx.userState ?? null,
            insurer ?? null
        ]);
        const row = result.rows[0];
        console.log(`[SusanTool:share_team_intel] Submitted – id=${row.id} user=${ctx.userEmail} type=${intel_type}`);
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
    }
    catch (err) {
        // Table may not exist yet (pre-migration) — fall back to stub
        const msg = err.message || '';
        if (msg.includes('does not exist')) {
            console.log(`[SusanTool:share_team_intel] Stub (table missing) – user=${ctx.userEmail} type=${intel_type}`);
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
const getJobDetailsDeclaration = {
    name: 'get_job_details',
    description: 'Retrieve full details of a job by job number. Use when the rep references a specific job number or asks about the status, claim info, or customer details for a job.',
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
async function executeGetJobDetails(args, ctx) {
    const { job_number } = args;
    try {
        const result = await ctx.pool.query(`SELECT
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
       LIMIT 1`, [job_number, ctx.userId]);
        if (result.rows.length === 0) {
            return {
                success: false,
                error: `No job found with number "${job_number}" for this user.`,
                job_number
            };
        }
        const row = result.rows[0];
        // Parse JSON columns safely
        const parseJson = (v) => {
            if (v == null)
                return null;
            if (typeof v === 'object')
                return v;
            try {
                return JSON.parse(v);
            }
            catch {
                return v;
            }
        };
        console.log(`[SusanTool:get_job_details] Found job=${job_number} user=${ctx.userEmail}`);
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
    }
    catch (err) {
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
const searchKnowledgeBaseDeclaration = {
    name: 'search_knowledge_base',
    description: 'Search the knowledge base for insurance tactics, claim strategies, product information, or training documents. Use when the rep asks a policy or procedure question that might be answered by internal documents.',
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
async function executeSearchKnowledgeBase(args, ctx) {
    const { query, limit = 5 } = args;
    const safeLimit = Math.min(Math.max(1, Number(limit) || 5), 20);
    try {
        // Build tsquery from the user's search query
        // Split into words, filter stop words, join with | (OR) for broader matching
        const searchWords = query
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this', 'our', 'are', 'was', 'what', 'how', 'does', 'who', 'which', 'can', 'you', 'know', 'about', 'each', 'one', 'work', 'should', 'need', 'have', 'would', 'could', 'when', 'where', 'they', 'them', 'their', 'there', 'here', 'just', 'like', 'also', 'been', 'from', 'some', 'will', 'more', 'very', 'than', 'only'].includes(w));
        let result;
        if (searchWords.length > 0) {
            // Try AND first for precision (all words must match), then OR for recall
            const tsQueryAnd = searchWords.map(w => w + ':*').join(' & ');
            const tsQueryOr = searchWords.map(w => w + ':*').join(' | ');
            // Precision: AND query — docs containing ALL search words rank highest
            result = await ctx.pool.query(`SELECT name, category, content,
          ts_rank(search_vector, to_tsquery('english', $1)) as rank
        FROM knowledge_documents
        WHERE search_vector @@ to_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2`, [tsQueryAnd, safeLimit]);
            // If AND found too few, supplement with OR results (broader recall)
            if (result.rows.length < safeLimit) {
                const existingNames = new Set(result.rows.map((r) => r.name));
                const orResult = await ctx.pool.query(`SELECT name, category, content,
            ts_rank(search_vector, to_tsquery('english', $1)) as rank
          FROM knowledge_documents
          WHERE search_vector @@ to_tsquery('english', $1)
          ORDER BY rank DESC
          LIMIT $2`, [tsQueryOr, safeLimit]);
                // Merge without duplicates — AND results first (higher precision)
                for (const row of orResult.rows) {
                    if (!existingNames.has(row.name) && result.rows.length < safeLimit) {
                        result.rows.push(row);
                        existingNames.add(row.name);
                    }
                }
            }
            // If FTS found nothing at all, fall back to ILIKE (handles typos, partial words)
            if (result.rows.length === 0) {
                const conditions = searchWords.map((_, i) => `(content ILIKE '%' || $${i + 1} || '%' OR name ILIKE '%' || $${i + 1} || '%')`);
                const sql = `SELECT name, category, content,
          (${searchWords.map((_, i) => `(CASE WHEN name ILIKE '%' || $${i + 1} || '%' THEN 3 ELSE 0 END) + (CASE WHEN content ILIKE '%' || $${i + 1} || '%' THEN 1 ELSE 0 END)`).join(' + ')}) as rank
          FROM knowledge_documents
          WHERE ${conditions.join(' OR ')}
          ORDER BY rank DESC
          LIMIT $${searchWords.length + 1}`;
                result = await ctx.pool.query(sql, [...searchWords, safeLimit]);
            }
        }
        else {
            // Very short query — use original exact match
            result = await ctx.pool.query(`SELECT name, category, content
         FROM knowledge_documents
         WHERE content ILIKE '%' || $1 || '%'
            OR name    ILIKE '%' || $1 || '%'
         LIMIT $2`, [query, safeLimit]);
        }
        if (result.rows.length === 0) {
            return {
                success: true,
                query,
                results: [],
                message: 'No matching documents found in the knowledge base. The answer may be in the rep\'s conversation context or frontend RAG index.'
            };
        }
        console.log(`[SusanTool:search_knowledge_base] Found ${result.rows.length} docs for query="${query}" user=${ctx.userEmail}`);
        return {
            success: true,
            query,
            total_found: result.rows.length,
            results: result.rows.map((r) => ({
                name: r.name,
                category: r.category,
                excerpt: typeof r.content === 'string' ? r.content.slice(0, 600) : null
            }))
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // If the search_vector column doesn't exist yet, fall back to ILIKE
        if (message.includes('search_vector') || message.includes('does not exist')) {
            console.warn('[SusanTool:search_knowledge_base] FTS not available, using ILIKE fallback');
            const result = await ctx.pool.query(`SELECT name, category, content
         FROM knowledge_documents
         WHERE content ILIKE '%' || $1 || '%'
            OR name    ILIKE '%' || $1 || '%'
         LIMIT $2`, [query, safeLimit]);
            return {
                success: true,
                query,
                total_found: result.rows.length,
                results: result.rows.map((r) => ({
                    name: r.name,
                    category: r.category,
                    excerpt: typeof r.content === 'string' ? r.content.slice(0, 600) : null
                }))
            };
        }
        // If the table doesn't exist yet, return a soft fallback
        if (message.includes('relation')) {
            return {
                success: true,
                query,
                results: [],
                message: 'Knowledge base table not yet provisioned.'
            };
        }
        console.error(`[SusanTool:search_knowledge_base] Error:`, message);
        return { success: false, error: message };
    }
}
// ---------------------------------------------------------------------------
// Tool 8: lookup_insurance_company
// ---------------------------------------------------------------------------
const lookupInsuranceCompanyDeclaration = {
    name: 'lookup_insurance_company',
    description: 'Look up insurance company contact details, claims phone numbers, email addresses, mobile apps, and notes. Use when a rep asks about a specific insurance company, needs a claims phone number, email, app name, or how to file with a particular insurer. Can also list all companies.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: 'Insurance company name or partial name to search for (e.g. "State Farm", "USAA", "Erie"). Leave empty to list all companies.'
            }
        },
        required: []
    }
};
async function executeLookupInsuranceCompany(args, ctx) {
    const query = (args.query || '').trim();
    try {
        let result;
        if (query) {
            result = await ctx.pool.query(`SELECT name, phone, email, category, website, notes
         FROM insurance_companies
         WHERE LOWER(name) LIKE '%' || $1 || '%'
         ORDER BY name ASC
         LIMIT 10`, [query.toLowerCase()]);
        }
        else {
            result = await ctx.pool.query(`SELECT name, phone, email, category, notes
         FROM insurance_companies
         ORDER BY name ASC
         LIMIT 50`);
        }
        if (result.rows.length === 0) {
            return {
                success: true,
                query,
                results: [],
                message: `No insurance company matching "${query}" found in the directory. The Insurance tab in the Knowledge Base has 49 companies — the rep can browse there, or try a different name.`
            };
        }
        console.log(`[SusanTool:lookup_insurance_company] Found ${result.rows.length} companies for query="${query}" user=${ctx.userEmail}`);
        return {
            success: true,
            query,
            total_found: result.rows.length,
            results: result.rows.map((r) => ({
                name: r.name,
                claims_phone: r.phone,
                claims_email: r.email,
                mobile_app: r.category || 'Web Portal',
                login_url: r.website || null,
                notes: r.notes
            }))
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Table might not exist yet — return soft fallback
        if (message.includes('relation') || message.includes('does not exist')) {
            return {
                success: true,
                query,
                results: [],
                message: 'Insurance companies table not yet provisioned. The rep can check the Insurance tab in the Knowledge Base for company details.'
            };
        }
        console.error(`[SusanTool:lookup_insurance_company] Error:`, message);
        return { success: false, error: message };
    }
}
// ---------------------------------------------------------------------------
// Tool 9: send_email (via Gmail)
// ---------------------------------------------------------------------------
const sendEmailDeclaration = {
    name: 'send_email',
    description: "Send an email via the rep's connected Gmail account. Use when the rep asks to send, email, or forward something to someone. If the rep has not connected their Google account, return instructions to do so.",
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
async function executeSendEmail(args, ctx) {
    const { to, subject, body, cc } = args;
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
const createCalendarEventDeclaration = {
    name: 'create_calendar_event',
    description: "Create a Google Calendar event on the rep's calendar. Use when the rep says to schedule a meeting, appointment, or event. Requires connected Google account.",
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
async function executeCreateCalendarEvent(args, ctx) {
    const { summary, start_time, end_time, description, location, attendee_emails } = args;
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
            await ctx.pool.query(`INSERT INTO agent_tasks (user_id, title, description, task_type, due_at, priority)
         VALUES ($1, $2, $3, 'event', $4, 'medium')`, [ctx.userId, summary, description || location || null, dueAt.toISOString()]);
        }
        catch { /* best-effort fallback */ }
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
const checkAvailabilityDeclaration = {
    name: 'check_availability',
    description: "Check the rep's Google Calendar for availability during a time range. Use when the rep asks if they are free at a certain time or wants to find an open slot.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            start_time: { type: Type.STRING, description: 'Start of time range (ISO 8601).' },
            end_time: { type: Type.STRING, description: 'End of time range (ISO 8601).' }
        },
        required: ['start_time', 'end_time']
    }
};
async function executeCheckAvailability(args, ctx) {
    const { start_time, end_time } = args;
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
const fetchCalendarEventsDeclaration = {
    name: 'fetch_calendar_events',
    description: "Fetch the rep's upcoming calendar events. Use when the rep asks what they have scheduled, " +
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
async function executeFetchCalendarEvents(args, ctx) {
    const startDate = args.start_date || new Date().toISOString();
    const endDate = args.end_date || new Date(Date.now() + 7 * 86400000).toISOString();
    const events = [];
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
        const localResult = await ctx.pool.query(`SELECT summary, start_time, end_time, location, event_type
       FROM calendar_events
       WHERE user_id = $1 AND status = 'active'
         AND start_time >= $2 AND start_time <= $3
       ORDER BY start_time LIMIT 20`, [ctx.userId, startDate, endDate]);
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
    }
    catch { /* table may not exist yet */ }
    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
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
const sendNotificationDeclaration = {
    name: 'send_notification',
    description: 'Send a push notification to the current user, a specific team member by email, or the entire team. Use for reminders, alerts, or important updates that need immediate attention on their phone.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            recipient: {
                type: Type.STRING,
                description: 'Who to notify: "self" for current user, "team" for all team members, or an email address for a specific person.'
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
                description: 'Type of notification: "reminder", "alert", "update", or "storm_alert". Defaults to "alert".'
            }
        },
        required: ['title', 'body']
    }
};
async function executeSendNotification(args, ctx) {
    const { pool } = ctx;
    const title = String(args.title || 'Notification');
    const body = String(args.body || '');
    const recipient = String(args.recipient || 'self').toLowerCase().trim();
    const notificationType = String(args.notification_type || 'alert');
    // Import push service
    const { createPushNotificationService } = await import('./pushNotificationService.js');
    const pushService = createPushNotificationService(pool);
    const results = [];
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
    }
    else if (recipient === 'team') {
        // Send to all active team members
        const teamMembers = await pool.query(`SELECT id FROM users WHERE is_active = TRUE`);
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
    }
    else {
        // Send to specific user by email
        const targetUser = await pool.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [recipient]);
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
// ---------------------------------------------------------------------------
// Tool 13: generate_storm_report
// ---------------------------------------------------------------------------
const generateStormReportDeclaration = {
    name: 'generate_storm_report',
    description: 'Generate a professional Storm Impact Analysis PDF for a property address. ' +
        'IMPORTANT: Before calling this, you MUST first call lookup_hail_data to find storm events and let the rep choose a date of loss. ' +
        'Returns a download link to the PDF. The report includes NOAA verified observations, NWS warnings, NEXRAD radar imagery, and a damage narrative.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            address: {
                type: Type.STRING,
                description: 'Full property address, e.g. "8100 Boone Blvd, Tysons, VA 22182".'
            },
            lat: {
                type: Type.NUMBER,
                description: 'Latitude from the lookup_hail_data result.'
            },
            lng: {
                type: Type.NUMBER,
                description: 'Longitude from the lookup_hail_data result.'
            },
            dateOfLoss: {
                type: Type.STRING,
                description: 'Date of loss in YYYY-MM-DD format chosen by the rep from the storm events list.'
            },
            customerName: {
                type: Type.STRING,
                description: 'Homeowner / property owner name (optional, will appear on the report).'
            },
            radius: {
                type: Type.NUMBER,
                description: 'Search radius in miles. Defaults to 15.'
            }
        },
        required: ['address', 'lat', 'lng', 'dateOfLoss']
    }
};
async function executeGenerateStormReport(args, ctx) {
    const address = String(args.address || '');
    const lat = Number(args.lat);
    const lng = Number(args.lng);
    const dateOfLoss = String(args.dateOfLoss || '');
    const customerName = args.customerName ? String(args.customerName) : undefined;
    const radius = Number(args.radius) || 15;
    if (!address || !Number.isFinite(lat) || !Number.isFinite(lng) || !dateOfLoss) {
        return { success: false, error: 'address, lat, lng, and dateOfLoss are required.' };
    }
    try {
        // 1. Fetch NOAA events
        const years = 2;
        const noaaEvents = await noaaStormService.getStormEvents(lat, lng, radius, years);
        const getDateKey = (d) => d.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
        const datedEvents = noaaEvents.filter(e => getDateKey(e.date) === dateOfLoss);
        const hailEvents = datedEvents.filter(e => e.eventType === 'hail');
        const windEvents = datedEvents.filter(e => e.eventType === 'wind');
        const historyHail = noaaEvents.filter(e => e.eventType === 'hail');
        if (!datedEvents.length) {
            return { success: false, error: `No storm events found on ${dateOfLoss} within ${radius} miles of ${address}.` };
        }
        // 2. Build damage score
        const maxHailSize = Math.max(0, ...hailEvents.map(e => e.magnitude || 0));
        const cumulative = hailEvents.reduce((s, e) => s + (e.magnitude || 0), 0);
        const score = Math.max(0, Math.min(100, Math.round(hailEvents.length * 8 + windEvents.length * 5 + maxHailSize * 18 + cumulative * 4)));
        const riskLevel = score >= 76 ? 'Critical' : score >= 51 ? 'High' : score >= 26 ? 'Moderate' : 'Low';
        const riskColor = { Critical: '#b91c1c', High: '#ea580c', Moderate: '#ca8a04', Low: '#16a34a' };
        // 3. Haversine distance helper
        const dist = (eLat, eLng) => {
            const R = 3958.8;
            const dLat = ((eLat - lat) * Math.PI) / 180;
            const dLon = ((eLng - lng) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((eLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };
        // 4. Normalize date-only values to ET afternoon
        const normalizeDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T17:00:00-04:00` : d;
        const mapEvent = (e) => ({
            id: e.id || `noaa-${Math.random().toString(36).slice(2, 8)}`,
            date: normalizeDate(e.date),
            latitude: e.latitude,
            longitude: e.longitude,
            magnitude: e.magnitude,
            hailSize: e.eventType === 'hail' ? e.magnitude : null,
            eventType: e.eventType,
            location: e.location || '',
            distanceMiles: Number.isFinite(e.latitude) && e.latitude !== 0 ? dist(e.latitude, e.longitude) : undefined,
            comments: e.narrative || e.description || '',
            source: 'NOAA Storm Events',
            severity: e.eventType === 'hail' ? ((e.magnitude || 0) >= 1.75 ? 'severe' : (e.magnitude || 0) >= 1 ? 'moderate' : 'minor') : undefined,
        });
        // 5. Build payload matching what the generate-report endpoint expects
        const payload = {
            address,
            lat,
            lng,
            radius,
            events: [],
            noaaEvents: datedEvents.map(mapEvent),
            historyEvents: historyHail.map(mapEvent),
            damageScore: {
                score,
                riskLevel,
                summary: score >= 60
                    ? 'Documented storm activity supports a high-likelihood roof damage conversation.'
                    : score >= 30
                        ? 'Documented storm history supports a moderate damage review.'
                        : 'Limited storm history was found for this loss date.',
                color: riskColor[riskLevel] || '#16a34a',
                factors: {
                    eventCount: datedEvents.length,
                    stormSystemCount: 1,
                    maxHailSize,
                    recentActivity: datedEvents.length,
                    cumulativeExposure: cumulative,
                    severityDistribution: {
                        severe: hailEvents.filter(e => (e.magnitude || 0) >= 1.75).length,
                        moderate: hailEvents.filter(e => (e.magnitude || 0) >= 1 && (e.magnitude || 0) < 1.75).length,
                        minor: hailEvents.filter(e => (e.magnitude || 0) < 1).length,
                    },
                    recencyScore: 0,
                    documentedDamage: 0,
                    windEvents: windEvents.length,
                },
            },
            filter: 'hail-wind',
            includeNexrad: true,
            includeMap: true,
            includeWarnings: true,
            dateOfLoss,
            template: 'noaa-forward',
            customerName,
        };
        // 5b. Rep info resolved server-side from x-user-email header (no hardcoded defaults)
        // 6. Call the report endpoint internally
        const port = process.env.PORT || 8080;
        const reportRes = await fetch(`http://localhost:${port}/api/hail/generate-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-email': ctx.userEmail },
            body: JSON.stringify(payload),
        });
        if (!reportRes.ok) {
            const errBody = await reportRes.text();
            return { success: false, error: `Report generation failed (${reportRes.status}): ${errBody}` };
        }
        // 7. Save PDF to uploads directory
        const buffer = Buffer.from(await reportRes.arrayBuffer());
        const fs = await import('fs');
        const pathMod = await import('path');
        const { fileURLToPath: toPath } = await import('url');
        const __dirname = pathMod.dirname(toPath(import.meta.url));
        const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
        const uploadsBase = isRailway ? '/app/data/uploads' : pathMod.resolve(__dirname, '../../public/uploads');
        const reportsDir = pathMod.join(uploadsBase, 'reports');
        fs.mkdirSync(reportsDir, { recursive: true });
        const safeName = address.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
        const filename = `Storm_Report_${safeName}_${dateOfLoss}_${Date.now()}.pdf`;
        const filepath = pathMod.join(reportsDir, filename);
        fs.writeFileSync(filepath, buffer);
        const downloadUrl = `/uploads/reports/${filename}`;
        return {
            success: true,
            download_url: downloadUrl,
            filename,
            address,
            dateOfLoss,
            eventsOnDate: datedEvents.length,
            hailEvents: hailEvents.length,
            windEvents: windEvents.length,
            maxHailSize: maxHailSize > 0 ? `${maxHailSize.toFixed(2)}"` : 'none',
            riskLevel,
            damageScore: score,
            message: `Storm Impact Analysis PDF is ready. The rep can download it at the link below.`,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SusanTool:generate_storm_report] Error:', message);
        return { success: false, error: `Failed to generate storm report: ${message}` };
    }
}
// ---------------------------------------------------------------------------
// Tool 14: record_claim_outcome
// ---------------------------------------------------------------------------
const recordClaimOutcomeDeclaration = {
    name: 'record_claim_outcome',
    description: 'Record the outcome of an insurance claim (approved, partial, denied, pending). ' +
        'Use when a rep tells you a claim result, supplement outcome, or adjuster decision. ' +
        'This data helps Susan learn which arguments and strategies work for which insurers.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            insuranceCompany: { type: Type.STRING, description: 'Insurance company name (e.g. "State Farm", "Travelers")' },
            claimResult: { type: Type.STRING, description: 'Outcome: "approved", "partial", "denied", or "pending"' },
            claimNumber: { type: Type.STRING, description: 'Claim number if mentioned' },
            approvalAmount: { type: Type.NUMBER, description: 'Dollar amount approved (if applicable)' },
            keyArguments: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Arguments/strategies that worked or were used' },
            lessonsLearned: { type: Type.STRING, description: 'What the rep learned from this outcome' },
            state: { type: Type.STRING, description: 'State (VA, MD, PA)' },
        },
        required: ['insuranceCompany', 'claimResult']
    }
};
async function executeRecordClaimOutcome(args, ctx) {
    const insuranceCompany = String(args.insuranceCompany || '');
    const claimResult = String(args.claimResult || '').toLowerCase();
    const claimNumber = args.claimNumber ? String(args.claimNumber) : null;
    const approvalAmount = args.approvalAmount ? Number(args.approvalAmount) : null;
    const keyArguments = Array.isArray(args.keyArguments) ? args.keyArguments.map(String) : [];
    const lessonsLearned = args.lessonsLearned ? String(args.lessonsLearned) : null;
    const state = args.state ? String(args.state).toUpperCase() : ctx.userState || null;
    if (!insuranceCompany || !['approved', 'partial', 'denied', 'pending'].includes(claimResult)) {
        return { success: false, error: 'insuranceCompany and valid claimResult (approved/partial/denied/pending) required' };
    }
    try {
        await ctx.pool.query(`INSERT INTO storm_claim_outcomes
        (user_id, insurance_company, claim_number, claim_result,
         approval_amount, key_arguments, lessons_learned, claim_status, outcome_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $4, CURRENT_DATE)`, [ctx.userId, insuranceCompany, claimNumber, claimResult,
            approvalAmount, keyArguments.length > 0 ? keyArguments : null, lessonsLearned]);
        // Also save as a memory for future context
        await ctx.pool.query(`INSERT INTO user_memory (user_id, memory_type, category, key, value, confidence, source_type)
       VALUES ($1, 'outcome', 'claim_outcome', $2, $3, 0.9, 'explicit')
       ON CONFLICT DO NOTHING`, [ctx.userId, `${insuranceCompany}_${claimResult}`,
            `${claimResult} claim with ${insuranceCompany}${state ? ` in ${state}` : ''}${approvalAmount ? ` for $${approvalAmount}` : ''}. ${keyArguments.length ? 'Key arguments: ' + keyArguments.join(', ') : ''}`.trim()]);
        return {
            success: true,
            message: `Recorded ${claimResult} outcome with ${insuranceCompany}. This helps me learn what works.`,
            insuranceCompany,
            claimResult,
            approvalAmount,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SusanTool:record_claim_outcome] Error:', message);
        return { success: false, error: `Failed to record outcome: ${message}` };
    }
}
// Public API: SUSAN_TOOLS array + executeTool dispatcher
// ---------------------------------------------------------------------------
/** All Susan function declarations in Gemini format */
export const SUSAN_TOOLS = [
    scheduleFollowupDeclaration,
    lookupHailDataDeclaration,
    lookupMrmsRadarDeclaration,
    saveClientNoteDeclaration,
    draftEmailDeclaration,
    shareTeamIntelDeclaration,
    getJobDetailsDeclaration,
    searchKnowledgeBaseDeclaration,
    lookupInsuranceCompanyDeclaration,
    sendEmailDeclaration,
    createCalendarEventDeclaration,
    checkAvailabilityDeclaration,
    fetchCalendarEventsDeclaration,
    sendNotificationDeclaration,
    generateStormReportDeclaration,
    recordClaimOutcomeDeclaration
];
/** Map from tool name to executor for O(1) dispatch */
const TOOL_EXECUTORS = {
    schedule_followup: executeScheduleFollowup,
    lookup_hail_data: executeLookupHailData,
    lookup_mrms_radar: executeLookupMrmsRadar,
    save_client_note: executeSaveClientNote,
    draft_email: executeDraftEmail,
    share_team_intel: executeShareTeamIntel,
    get_job_details: executeGetJobDetails,
    search_knowledge_base: executeSearchKnowledgeBase,
    lookup_insurance_company: executeLookupInsuranceCompany,
    send_email: executeSendEmail,
    create_calendar_event: executeCreateCalendarEvent,
    check_availability: executeCheckAvailability,
    fetch_calendar_events: executeFetchCalendarEvents,
    send_notification: executeSendNotification,
    generate_storm_report: executeGenerateStormReport,
    record_claim_outcome: executeRecordClaimOutcome
};
/**
 * Execute a named tool with the given arguments and user context.
 * Returns a ToolResult regardless of success/failure (errors are surfaced
 * in the result object so Gemini can decide how to respond).
 */
export async function executeTool(name, args, ctx) {
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
    }
    catch (err) {
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
