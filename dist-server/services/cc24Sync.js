// CC24 pipeline statuses that are terminal — no point re-polling these.
const TERMINAL = new Set(['paid', 'lost', 'cancelled', 'complete', 'completed', 'invoiced']);
let lastSyncAt = 0;
export async function syncCc24Statuses(pool, opts = {}) {
    const intakeUrl = process.env.CC24_LEAD_INTAKE_URL || process.env.CC21_LEAD_INTAKE_URL;
    const secret = process.env.CC24_WEBSITE_SECRET || process.env.CC21_WEBSITE_SECRET;
    if (!intakeUrl || !secret)
        return { checked: 0, updated: 0, skipped: true, reason: 'not-configured' };
    // Throttle to once / 15 min unless forced (so it's safe to call on dashboard load).
    const now = Date.now();
    if (!opts.force && now - lastSyncAt < 15 * 60 * 1000)
        return { checked: 0, updated: 0, skipped: true, reason: 'throttled' };
    lastSyncAt = now;
    // Derive the read-back URL from the intake URL (…/website-lead → …/lead-status).
    const statusUrl = intakeUrl.replace(/\/website-lead\/?$/, '/lead-status');
    // Open jobs only: linked to a CC24 job and not already in a terminal state.
    const open = await pool.query(`SELECT id, cc24_job_id, cc24_status
       FROM profile_leads
      WHERE cc24_job_id IS NOT NULL
        AND (cc24_status IS NULL OR cc24_status NOT IN ('paid','lost','cancelled','complete','completed','invoiced'))
      LIMIT 2000`);
    if (!open.rows.length)
        return { checked: 0, updated: 0 };
    const ids = open.rows.map((r) => r.cc24_job_id);
    const statusById = {};
    for (let i = 0; i < ids.length; i += 400) {
        const batch = ids.slice(i, i + 400);
        try {
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), 8000);
            const r = await fetch(`${statusUrl}?ids=${encodeURIComponent(batch.join(','))}`, {
                headers: { 'X-Website-Secret': secret },
                signal: ac.signal,
            }).finally(() => clearTimeout(t));
            if (!r.ok) {
                console.error('[cc24 sync] non-OK', r.status);
                continue;
            }
            const j = await r.json();
            for (const job of j?.jobs || []) {
                if (job?.jobId && job?.status)
                    statusById[String(job.jobId)] = String(job.status);
            }
        }
        catch (e) {
            console.error('[cc24 sync] fetch failed:', e?.message);
        }
    }
    let updated = 0;
    for (const row of open.rows) {
        const st = statusById[row.cc24_job_id];
        if (!st)
            continue;
        if (st !== row.cc24_status) {
            await pool.query(`UPDATE profile_leads SET cc24_status = $1, cc24_status_at = NOW(), cc24_synced_at = NOW() WHERE id = $2`, [st, row.id]);
            updated++;
        }
        else {
            await pool.query(`UPDATE profile_leads SET cc24_synced_at = NOW() WHERE id = $1`, [row.id]);
        }
    }
    console.log(`[cc24 sync] checked ${open.rows.length}, updated ${updated} (terminal set: ${[...TERMINAL].join(',')})`);
    return { checked: open.rows.length, updated };
}
// CC24 pipeline stage ranks (from CC24 types/job.ts JOB_PIPELINE_STAGES) — used to
// bucket a lead's current status into the three commission-milestone "wins" for the
// funnel. A lead at a later stage has, by definition, passed the earlier milestones.
export const CC24_STAGE_RANK = {
    new_lead: 1, contacted: 2, inspection_scheduled: 3, inspection_complete: 4,
    estimate_sent: 5, follow_up: 6, contract_signed: 7, insurance_filed: 8,
    adjuster_scheduled: 9, adjuster_complete: 10, supplement_requested: 11, approved: 12,
    materials_ordered: 13, scheduled: 14, in_progress: 15, complete: 16, invoiced: 17, paid: 18,
};
export const WIN_RANK = { signed: 7, approved: 12, won: 16 }; // Win1 / Win2 / Win3 thresholds
