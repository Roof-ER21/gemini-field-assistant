import { sendGmailEmail } from './googleGmailService.js';
const ET = 'America/New_York';
const REPORT_LOGO = 'https://get.theroofdocs.com/roofer-logo-clean.png';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Prior full Mon–Sun in Eastern Time, as YYYY-MM-DD strings + a human label. */
export function priorWeekRangeET(now = new Date()) {
    // Reinterpret "now" as ET wall-clock so getDay/getDate reflect the ET calendar.
    const et = new Date(now.toLocaleString('en-US', { timeZone: ET }));
    const sinceMon = (et.getDay() + 6) % 7; // Mon=0 … Sun=6
    const thisMon = new Date(et);
    thisMon.setHours(12, 0, 0, 0);
    thisMon.setDate(et.getDate() - sinceMon);
    const from = new Date(thisMon);
    from.setDate(thisMon.getDate() - 7);
    const to = new Date(thisMon);
    to.setDate(thisMon.getDate() - 1);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nice = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return { fromD: iso(from), toD: iso(to), label: `${nice(from)} – ${nice(to)}, ${to.getFullYear()}` };
}
export async function fetchWeeklyReportData(pool, r) {
    const p = [r.fromD, r.toD];
    const [repsR, srcR] = await Promise.all([
        // Per-rep scorecard — scans + unique visitors + form fills (signups), ET-scoped.
        pool.query(`SELECT ep.name, ep.slug,
              COALESCE(s.scans, 0)::int  AS scans,
              COALESCE(s.uniq, 0)::int   AS uniq,
              COALESCE(l.signups, 0)::int AS signups
         FROM employee_profiles ep
         LEFT JOIN (
           SELECT profile_slug, COUNT(*) AS scans, COUNT(DISTINCT ip_hash) AS uniq
             FROM qr_scans
            WHERE (scanned_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            GROUP BY 1
         ) s ON s.profile_slug = ep.slug
         LEFT JOIN (
           SELECT ep2.slug, COUNT(*) AS signups
             FROM profile_leads pl JOIN employee_profiles ep2 ON ep2.id = pl.profile_id
            WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
            GROUP BY 1
         ) l ON l.slug = ep.slug
        WHERE ep.is_active = true
        ORDER BY scans DESC, signups DESC, ep.name ASC`, p),
        // Lead-source breakdown — where every form fill came from this week.
        pool.query(`SELECT CASE
                WHEN pl.source LIKE 'roofcheck%' OR pl.service_type LIKE '%RoofCheck%' THEN 'RoofCheck'
                WHEN pl.service_type = 'Free inspection (company page)' THEN 'Company /inspection page'
                WHEN pl.service_type = 'Free inspection (rep page)' OR pl.profile_id IS NOT NULL THEN 'Rep pages'
                ELSE 'Other / direct'
              END AS source,
              COUNT(*)::int AS leads,
              COUNT(*) FILTER (WHERE pl.preferred_date IS NOT NULL)::int AS booked
         FROM profile_leads pl
        WHERE (pl.created_at AT TIME ZONE '${ET}')::date BETWEEN $1::date AND $2::date
        GROUP BY 1
        ORDER BY leads DESC`, p),
    ]);
    const allReps = repsR.rows;
    const reps = allReps.filter((x) => x.scans > 0 || x.signups > 0);
    const sources = srcR.rows;
    return {
        reps,
        idleReps: allReps.length - reps.length,
        totalScans: allReps.reduce((a, x) => a + x.scans, 0),
        totalRepSignups: allReps.reduce((a, x) => a + x.signups, 0),
        sources,
        totalLeads: sources.reduce((a, s) => a + s.leads, 0),
        totalBooked: sources.reduce((a, s) => a + s.booked, 0),
    };
}
function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function renderEmail(d, r) {
    const conv = (n, den) => (den > 0 ? ((n / den) * 100).toFixed(1) + '%' : '—');
    const th = 'padding:10px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;';
    const td = 'padding:9px 10px;border-top:1px solid #eef0f4;font-size:14px;';
    const repRows = d.reps.length
        ? d.reps.map((x) => `<tr>
        <td style="${td}font-weight:600;color:#111827;">${esc(x.name)}</td>
        <td style="${td}text-align:right;color:#111827;">${x.scans}</td>
        <td style="${td}text-align:right;color:#6b7280;">${x.uniq}</td>
        <td style="${td}text-align:right;color:#111827;font-weight:700;">${x.signups}</td>
        <td style="${td}text-align:right;color:#166534;">${conv(x.signups, x.scans)}</td>
      </tr>`).join('')
        : `<tr><td colspan="5" style="${td}text-align:center;color:#6b7280;">No rep QR activity this week.</td></tr>`;
    const repTotal = `<tr>
        <td style="${td}border-top:2px solid #111827;font-weight:800;color:#111827;">TOTAL</td>
        <td style="${td}border-top:2px solid #111827;text-align:right;font-weight:800;">${d.totalScans}</td>
        <td style="${td}border-top:2px solid #111827;text-align:right;color:#6b7280;">—</td>
        <td style="${td}border-top:2px solid #111827;text-align:right;font-weight:800;">${d.totalRepSignups}</td>
        <td style="${td}border-top:2px solid #111827;text-align:right;color:#166534;font-weight:700;">${conv(d.totalRepSignups, d.totalScans)}</td>
      </tr>`;
    const srcRows = d.sources.length
        ? d.sources.map((s) => `<tr>
        <td style="${td}font-weight:600;color:#111827;">${esc(s.source)}</td>
        <td style="${td}text-align:right;font-weight:700;color:#111827;">${s.leads}</td>
        <td style="${td}text-align:right;color:#6b7280;">${s.booked}</td>
      </tr>`).join('')
        : `<tr><td colspan="3" style="${td}text-align:center;color:#6b7280;">No leads this week.</td></tr>`;
    const idleNote = d.idleReps > 0
        ? `<p style="font-size:12px;color:#9099b5;margin:8px 0 0;">+ ${d.idleReps} active rep${d.idleReps === 1 ? '' : 's'} had no scans this week.</p>`
        : '';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eceefb;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceefb;padding:30px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:18px;box-shadow:0 10px 34px rgba(17,24,39,.10);overflow:hidden;">
        <tr><td style="height:5px;background:linear-gradient(90deg,#111827,#dc2626);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 40px 6px;text-align:center;">
          <img src="${REPORT_LOGO}" width="176" alt="The Roof Docs" style="display:block;margin:0 auto 14px;width:176px;max-width:60%;height:auto;">
          <div style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:10px;">Weekly QR Report</div>
          <div style="font-size:22px;font-weight:800;color:#111827;">${esc(r.label)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:6px;">${d.totalScans} scans &nbsp;·&nbsp; ${d.totalLeads} leads &nbsp;·&nbsp; ${d.totalBooked} booked</div>
        </td></tr>
        <tr><td style="padding:22px 40px 6px;">
          <div style="font-size:13px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Rep Scorecard</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td style="${th}">Rep</td><td style="${th}text-align:right;">Scans</td><td style="${th}text-align:right;">Unique</td><td style="${th}text-align:right;">Form fills</td><td style="${th}text-align:right;">Conv%</td></tr>
            ${repRows}${repTotal}
          </table>
          ${idleNote}
        </td></tr>
        <tr><td style="padding:20px 40px 34px;">
          <div style="font-size:13px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Leads by Source</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td style="${th}">Source</td><td style="${th}text-align:right;">Form fills</td><td style="${th}text-align:right;">Booked</td></tr>
            ${srcRows}
          </table>
          <p style="font-size:11.5px;color:#9099b5;margin:14px 0 0;">"Booked" = homeowner picked an inspection date. Times in Eastern. Rep scans are QR/profile-page visits; form fills are submitted lead forms.</p>
        </td></tr>
      </table>
      <div style="font-size:11.5px;color:#9099b5;margin-top:18px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">The Roof Docs · Roof ER &nbsp;·&nbsp; Weekly QR &amp; lead report &nbsp;·&nbsp; VA · MD · PA</div>
    </td></tr>
  </table>
</body></html>`;
}
/** Build + send the weekly report. Returns per-recipient outcome. */
export async function sendWeeklyQrReport(pool, opts = {}) {
    const range = opts.range || priorWeekRangeET();
    const data = await fetchWeeklyReportData(pool, range);
    const adminEmail = process.env.LEAD_ADMIN_EMAIL || 'ahmed.mahmoud@theroofdocs.com';
    // opts.recipients (e.g. a test send) overrides the env list.
    const recipients = (opts.recipients && opts.recipients.length ? opts.recipients : (process.env.QR_REPORT_RECIPIENTS || adminEmail).split(','))
        .map((s) => s.trim()).filter(Boolean);
    const adminRow = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [adminEmail]);
    const adminUserId = adminRow.rows[0]?.id || null;
    if (!adminUserId) {
        console.error('[weekly-qr-report] no admin sender for', adminEmail);
        return { success: false, recipients, range, error: 'admin sender not found' };
    }
    const html = renderEmail(data, range);
    const subject = `QR Weekly Report — ${range.label} (${data.totalScans} scans, ${data.totalLeads} leads)`;
    let anySuccess = false;
    let lastErr;
    for (const to of recipients) {
        const res = await sendGmailEmail(pool, adminUserId, { to, subject, body: html });
        if (res.success)
            anySuccess = true;
        else
            lastErr = res.error;
        console.log(`[weekly-qr-report] ${range.fromD}..${range.toD} -> ${to}: ${res.success ? 'sent ' + res.messageId : 'FAIL ' + res.error}`);
    }
    return { success: anySuccess, recipients, range, error: anySuccess ? undefined : lastErr };
}
