const ALERT_STATES = new Set(['VA', 'MD', 'PA', 'DC']);
const ALLOWED_EVENTS = new Set([
    'Severe Thunderstorm Warning',
    'Tornado Warning',
    'Tornado Emergency',
]);
const SALES_TEAM_GROUP_ID = '93177620';
const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID || '';
const TEST_BOT_ID = process.env.GROUPME_TEST_BOT_ID || '';
const TEST_GROUP_ID = process.env.GROUPME_TEST_GROUP_ID || '';
async function fetchActiveAlertsForStates() {
    const states = Array.from(ALERT_STATES).join(',');
    const url = `https://api.weather.gov/alerts/active?area=${states}&status=actual&message_type=alert,update`;
    try {
        const r = await fetch(url, {
            headers: {
                'Accept': 'application/geo+json',
                'User-Agent': 'RoofER-WeatherIntel/1.0 (ahmed.mahmoud@theroofdocs.com)',
            },
            signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) {
            console.warn(`[LiveNwsAlert] fetch HTTP ${r.status}`);
            return [];
        }
        const d = (await r.json());
        return d.features || [];
    }
    catch (e) {
        console.warn('[LiveNwsAlert] fetch err:', e.message);
        return [];
    }
}
async function ensureSchema(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_nws_alerts_sent (
      id         BIGSERIAL PRIMARY KEY,
      alert_id   TEXT NOT NULL UNIQUE,
      event      TEXT NOT NULL,
      area_desc  TEXT,
      expires_at TIMESTAMPTZ,
      group_id   TEXT,
      posted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_bot_nws_alerts_sent_posted
      ON bot_nws_alerts_sent (posted_at DESC);
  `);
}
async function postToGroupMe(botId, text) {
    try {
        const r = await fetch('https://api.groupme.com/v3/bots/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bot_id: botId, text }),
            signal: AbortSignal.timeout(10_000),
        });
        return r.ok;
    }
    catch {
        return false;
    }
}
function formatExpiry(expires, ends) {
    const t = ends || expires;
    if (!t)
        return 'until further notice';
    try {
        const d = new Date(t);
        const et = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
        }).format(d);
        return `until ${et}`;
    }
    catch {
        return 'until further notice';
    }
}
// Pull the affected state(s) off areaDesc. NWS lists counties like
// "Loudoun, VA; Fairfax, VA; Prince William, VA" — we just want to verify
// at least one county is in our ALERT_STATES set.
function anyStateInScope(areaDesc) {
    if (!areaDesc)
        return false;
    const up = areaDesc.toUpperCase();
    return ['VA', 'MD', 'PA', 'DC'].some((s) => up.includes(` ${s};`) || up.endsWith(` ${s}`) || up.includes(` ${s},`));
}
function tierEmojiForEvent(event) {
    if (/Tornado/i.test(event))
        return '🌪️🚨';
    return '⛈️';
}
export async function runLiveNwsWarningCheck(pool, opts = {}) {
    const flagVal = process.env.LIVE_MRMS_ALERT_ENABLED;
    const enabled = flagVal === 'true' || flagVal === 'test-group' || flagVal === 'approval-gate';
    const testMode = opts.forceTestGroup === true || flagVal === 'test-group';
    const approvalGate = flagVal === 'approval-gate' && !opts.forceTestGroup;
    if (!enabled && !opts.dryRun && !opts.forceTestGroup) {
        return { ran: false, reason: 'LIVE_MRMS_ALERT_ENABLED not set', active_warnings: 0, new_posted: 0, skipped_duplicate: 0, skipped_out_of_scope: 0 };
    }
    await ensureSchema(pool);
    const features = await fetchActiveAlertsForStates();
    let newPosted = 0, skippedDup = 0, skippedOutOfScope = 0;
    // approval-gate: post proposal to test group, forward via webhook on ✅
    const targetBotId = (testMode || approvalGate) ? TEST_BOT_ID : GROUPME_BOT_ID;
    const targetGroupId = (testMode || approvalGate) ? TEST_GROUP_ID : SALES_TEAM_GROUP_ID;
    const forwardBotId = approvalGate ? GROUPME_BOT_ID : targetBotId;
    const forwardGroupId = approvalGate ? SALES_TEAM_GROUP_ID : targetGroupId;
    for (const f of features) {
        const p = f.properties;
        if (!p || !p.id || !p.event)
            continue;
        if (!ALLOWED_EVENTS.has(p.event))
            continue;
        if (!anyStateInScope(p.areaDesc || '')) {
            skippedOutOfScope++;
            continue;
        }
        // Check dedup
        const { rows } = await pool.query(`SELECT 1 FROM bot_nws_alerts_sent WHERE alert_id = $1`, [p.id]);
        if (rows.length > 0) {
            skippedDup++;
            continue;
        }
        // Build message — compact, rep-facing
        const emoji = tierEmojiForEvent(p.event);
        const expiry = formatExpiry(p.expires, p.ends);
        const areaShort = (p.areaDesc || '')
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
            .join(' · ');
        const moreCounties = (p.areaDesc || '').split(';').length > 6 ? ` (+more)` : '';
        const text = [
            `${emoji} ${p.event.toUpperCase()} — in effect ${expiry}`,
            areaShort + moreCounties,
            '',
            'Map: sa21.up.railway.app → Storm Maps',
        ].join('\n');
        if (opts.dryRun) {
            newPosted++;
            continue;
        }
        if (!targetBotId) {
            console.warn('[LiveNwsAlert] no target bot id configured; would have posted:', text.slice(0, 80));
            continue;
        }
        let textToPost = text;
        if (approvalGate) {
            try {
                const { createPendingAlert } = await import('./pendingAlertsService.js');
                const created = await createPendingAlert(pool, {
                    source: 'nws',
                    targetGroupId: forwardGroupId,
                    targetBotId: forwardBotId,
                    messageText: text,
                    metadata: { event: p.event, alertId: p.id, areaDesc: p.areaDesc, expires: p.expires },
                });
                textToPost = created.proposalText;
                console.log(`[LiveNwsAlert] approval-gate pending=${created.alertId} for ${p.event}`);
            }
            catch (e) {
                console.error('[LiveNwsAlert] approval-gate persist failed:', e.message);
            }
        }
        const posted = await postToGroupMe(targetBotId, textToPost);
        if (posted) {
            await pool.query(`INSERT INTO bot_nws_alerts_sent (alert_id, event, area_desc, expires_at, group_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (alert_id) DO NOTHING`, [p.id, p.event, p.areaDesc || null, p.expires ? new Date(p.expires) : null, targetGroupId]);
            newPosted++;
            const targetLabel = approvalGate ? 'approval-gate' : (testMode ? 'test-group' : 'sales-team');
            console.log(`[LiveNwsAlert] posted ${p.event} (${p.id.slice(-12)}) to ${targetLabel}`);
        }
    }
    return {
        ran: true,
        active_warnings: features.length,
        new_posted: newPosted,
        skipped_duplicate: skippedDup,
        skipped_out_of_scope: skippedOutOfScope,
        target_group: targetGroupId,
    };
}
