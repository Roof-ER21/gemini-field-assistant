// @ts-nocheck
/**
 * RoofCheck — Roof-ER public storm-damage self-check lead magnet (served from sa21).
 *
 *   GET  /roofcheck                 → the homeowner landing page (Roof-ER branded)
 *   POST /api/roofcheck/lookup      → {address|lat,lng} → geocode + hail teaser (no detail leaks)
 *   POST /api/roofcheck/lead        → {name,phone,email,rep,src,...} → attributed lead + reward
 *   GET  /api/roofcheck/staticmap   → proxied static map (Maps key stays server-side)
 *
 * Data is sa21's own backend: getAddressHailImpactViaHailYes (address-level hail
 * history) + the completed-jobs neighbor proof. Hail Yes is a silent backend feed
 * here — never shown, never in a URL. Leads land in profile_leads attributed to the
 * rep whose ?rep=<slug> link was used, so they flow into Scan Analytics + the QR
 * signup tracking, tagged with the channel (?src=door|text|social…).
 */
import { Router, type Request, type Response } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { pc, sec, loadContent, markEm, type ContentMap } from '../routes/leadContent.js';
import { getAddressHailImpactViaHailYes } from '../services/hailYesImpactAdapter.js';
import { fetchMapImage } from '../services/mapImageService.js';
import { forwardLeadToJotForm, processLeadIntegrations } from '../routes/profileRoutes.js';
import { canManageQR } from '../lib/permissions.js';
import { ihmConfigured, ihmProbe, getAddressHailImpactViaIHM } from '../services/ihmImpactAdapter.js';

// Neighbor proof — completed jobs [{la,ln,a,c}]. Read from source dir (present at
// runtime on Railway); fall back gracefully so a missing file never crashes boot.
let JOBS: Array<{ la: number; ln: number; a: string; c: string }> = [];
try {
  JOBS = JSON.parse(readFileSync(path.resolve(process.cwd(), 'server/roofcheck/completed-jobs.json'), 'utf8'));
} catch {
  try { JOBS = JSON.parse(readFileSync(new URL('./completed-jobs.json', import.meta.url), 'utf8')); } catch { JOBS = []; }
}

function miles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8, t = Math.PI / 180;
  const dLa = (bLat - aLat) * t, dLn = (bLng - aLng) * t;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function streetOf(a: string): string {
  const p = String(a || '').split(',')[0].trim();
  const m = p.match(/^\d+[a-z]?\s+(.*)$/i);
  return m ? m[1] : p;
}
function fmtDate(s: string): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const M = ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1];
  return `${M} ${d}, ${y}`;
}
function hailLabel(t: { maxHailInches?: number | null; sizeLabel?: string | null }): string {
  if (t.maxHailInches && t.maxHailInches > 0) return `${Math.round(t.maxHailInches * 4) / 4}″ hail`;
  if (t.sizeLabel) return t.sizeLabel;
  return 'hail';
}

// Census geocoder (free, US-only — same source sa21's Susan bot uses), Nominatim fallback.
async function geocode(address: string): Promise<{ lat: number; lng: number; normalized: string } | null> {
  try {
    const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
    const r = await fetch(u);
    const j: any = await r.json();
    const m = j?.result?.addressMatches?.[0];
    if (m?.coordinates) return { lat: Number(m.coordinates.y), lng: Number(m.coordinates.x), normalized: m.matchedAddress || address };
  } catch { /* */ }
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'RoofER-RoofCheck/1.0' } });
    const j: any = await r.json();
    if (j?.[0]) return { lat: Number(j[0].lat), lng: Number(j[0].lon), normalized: j[0].display_name || address };
  } catch { /* */ }
  return null;
}

async function impactFor(lat: number, lng: number) {
  // Homeowner hail source: prefer IHM (Interactive Hail Maps) when its creds are set;
  // fall back to Hail Yes on any IHM error so a quota/outage can never blank the tool.
  if (ihmConfigured()) {
    try { return await getAddressHailImpactViaIHM(lat, lng, 24); }
    catch (e) { console.warn('[roofcheck] IHM failed, falling back to Hail Yes:', (e as Error)?.message); }
  }
  try { return await getAddressHailImpactViaHailYes(lat, lng, 24); }
  catch { return null; }
}

export function createRoofCheckRoutes(pool: Pool) {
  const router = Router();

  router.get('/roofcheck', async (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Prefer a dedicated referrer-restricted BROWSER key for client autocomplete;
    // never the server key. If neither browser key is set, the page ships without
    // autocomplete (free-text input + server-side geocode still work fine).
    const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const content = await loadContent(pool); // Content Studio overrides (live, no deploy)
    res.send(renderPage(browserKey, content));
  });

  // Admin-only IHM probe — inspect the RAW Interactive Hail Maps response for a lat/lng so
  // the IHM→AddressImpactReport mapping can be finalized before RoofCheck is switched to it.
  // Off /api (email-auth, not session-gated), marketing/admin only to avoid burning IHM quota.
  // Returns raw IHM JSON only — never the credentials.
  router.get('/admin/ihm-raw', async (req: Request, res: Response) => {
    const email = String(req.query.email || '').trim();
    if (!email || !(await canManageQR(pool, email))) return res.status(403).json({ ok: false, error: 'marketing/admin only — pass ?email=<your email>' });
    if (!ihmConfigured()) return res.json({ ok: false, configured: false, note: 'Set IHM_API_USER/IHM_API_PASS (or IHM_BASIC_AUTH) in Railway first.' });
    const lat = Number(req.query.lat), lng = Number(req.query.lng), months = Number(req.query.months || 24);
    if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ ok: false, error: 'lat & lng query params required (e.g. ?lat=38.90&lng=-77.26&email=…)' });
    try {
      const out = await ihmProbe(lat, lng, months);
      res.json({ ok: true, ...out });
    } catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
  });

  // Brand audio identity assets (music bed + heartbeat) — served same-origin so the
  // page CSP (media-src 'self') allows playback. Files sit next to this route's source.
  const audioDir = existsSync(path.resolve(process.cwd(), 'server/roofcheck/brand-bed.mp3'))
    ? path.resolve(process.cwd(), 'server/roofcheck')
    : path.dirname(new URL(import.meta.url).pathname);
  const sendAudio = (file: string) => (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(audioDir, file));
  };
  router.get('/roofcheck/brand-bed.mp3', sendAudio('brand-bed.mp3'));
  router.get('/roofcheck/hb.mp3', sendAudio('hb.mp3'));

  // Static map proxy — keeps the Maps key server-side.
  router.get('/api/roofcheck/staticmap', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!isFinite(lat) || !isFinite(lng)) { res.status(400).end(); return; }
    try {
      const buf = await fetchMapImage({ lat, lng, zoom: 17, width: 640, height: 320, markers: [{ lat, lng, color: 'red' }] });
      if (!buf) { res.status(502).end(); return; }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(buf);
    } catch { res.status(502).end(); }
  });

  // Teaser — hook only, nothing usable leaks before the homeowner opts in.
  router.post('/api/roofcheck/lookup', async (req: Request, res: Response) => {
    try {
      let lat = Number(req.body?.lat), lng = Number(req.body?.lng);
      let normalized = String(req.body?.address || '').trim();
      if (!isFinite(lat) || !isFinite(lng)) {
        const address = String(req.body?.address || '').trim();
        if (address.length < 5) { res.json({ ok: false, error: 'Please enter your full address.' }); return; }
        const geo = await geocode(address);
        if (!geo) { res.json({ ok: false, error: "We couldn't find that address — add city and ZIP." }); return; }
        lat = geo.lat; lng = geo.lng; normalized = geo.normalized;
      }
      const report = await impactFor(lat, lng);
      const got = !!report && (report.summary.directHitCount + report.summary.nearMissCount) > 0;
      res.json({ ok: true, lat, lng, normalizedAddress: normalized, teaser: { got } });
    } catch (err) {
      console.error('[roofcheck] lookup error:', err);
      res.json({ ok: false, error: 'Something went wrong — please try again.' });
    }
  });

  // Opt-in — record the attributed lead + return the storm-history reward.
  router.post('/api/roofcheck/lead', async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').trim();
      const phone = String(b.phone || '').trim();
      const email = String(b.email || '').trim();
      if (!name || phone.replace(/\D/g, '').length < 7) { res.json({ ok: false, error: 'Please enter your name and phone.' }); return; }
      if (email && !email.includes('@')) { res.json({ ok: false, error: 'That email looks off — leave it blank or fix it.' }); return; }

      const lat = Number(b.lat) || null, lng = Number(b.lng) || null;
      const repSlug = String(b.rep || '').trim().toLowerCase() || null;
      const src = String(b.src || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || null;
      const address = String(b.address || '').trim();

      // Resolve the rep whose link was used → attribute the lead to their profile.
      let profileId: string | null = null;
      let repName: string | null = null, repEmail: string | null = null;
      if (repSlug) {
        const pr = await pool.query(`SELECT id, name, email FROM employee_profiles WHERE slug = $1 LIMIT 1`, [repSlug]);
        profileId = pr.rows[0]?.id || null;
        repName = pr.rows[0]?.name || null;
        repEmail = pr.rows[0]?.email || null;
      }

      // Build the reward server-side (gated): address-level hail history + neighbor proof.
      const report = (lat && lng) ? await impactFor(lat, lng) : null;
      const tiers = report
        ? [...report.directHits.map((t: any) => ({ ...t, _dh: true })), ...report.nearMiss.map((t: any) => ({ ...t, _dh: false }))]
            .sort((a: any, c: any) => String(c.date).localeCompare(String(a.date)))
            .slice(0, 8)
        : [];
      const events = tiers.map((t: any) => ({
        date: fmtDate(t.date) || t.date,
        mag: hailLabel(t),
        where: t._dh ? 'At your home' : (t.nearestMiles != null ? `${Math.round(t.nearestMiles * 10) / 10} mi away` : 'Nearby'),
        direct: !!t._dh,
      }));
      const qualifying = !!report && (report.summary.directHitCount > 0 || tiers.some((t: any) => (t.maxHailInches || 0) >= 1));

      let within = 0, nearest: any = null, nd = 9e9;
      if (lat && lng) for (const j of JOBS) {
        const d = miles(lat, lng, j.la, j.ln);
        if (d <= 1) within++;
        if (d < nd && d <= 2) { nd = d; nearest = j; }
      }

      const note = `INBOUND RoofCheck${repSlug ? ` (rep:${repSlug})` : ''}${src ? ` via ${src}` : ''} | `
        + `${report && report.summary.directHitCount > 0 ? `${report.summary.directHitCount} direct hit(s)` : (report && report.summary.nearMissCount > 0 ? `${report.summary.nearMissCount} near-miss` : 'no recent hail on record')}`
        + ` | ${events.length} events 2yr | ${within} roofs within 1mi`
        + (nearest ? ` (nearest ${streetOf(nearest.a)})` : '')
        + (qualifying ? ' | QUALIFYING' : '');

      // source carries the channel so the dashboard shows where it came from.
      const source = src ? `roofcheck-${src}` : 'roofcheck';
      const ins = await pool.query(
        `INSERT INTO profile_leads
           (profile_id, homeowner_name, homeowner_email, homeowner_phone, address, service_type, message, status, source, utm_source, utm_medium)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,'roofcheck',$9)
         RETURNING id`,
        [profileId, name, email || null, phone, address || null, 'Storm check (RoofCheck)', note, source, src || null],
      );
      const leadId = ins.rows[0]?.id || null;

      // Run the SAME pipeline the QR contact form uses: forward into CC24 Active
      // Leads + notify the rep (their own Gmail, admin-fallback) + in-app bell +
      // admin BCC, all attributed to the rep when the link carried ?rep=. profileId
      // may be null (no rep) — CC24 still gets the lead; the rep-notify steps no-op.
      processLeadIntegrations(profileId, leadId, {
        homeownerName: name,
        homeownerEmail: email || null,
        homeownerPhone: phone,
        address: address || null,
        serviceType: 'Storm check (RoofCheck)',
        message: note,
        sourceLabel: `RoofCheck${src ? ` (${src})` : ''}`,
      }, { skipHomeownerConfirm: true }); // homeowner sees results + scheduler on-page; confirm only when they book

      // Also push into JotForm (inert until JOTFORM_API_KEY is set).
      forwardLeadToJotForm({
        homeownerName: name,
        homeownerEmail: email || null,
        homeownerPhone: phone,
        address: address || null,
        serviceType: 'Storm check (RoofCheck)',
        message: note,
        sourceLabel: `RoofCheck${src ? ` (${src})` : ''}`,
        rep: repSlug,
      });

      res.json({
        ok: true,
        leadId,
        reward: {
          events,
          qualifying,
          map: (lat && lng) ? `/api/roofcheck/staticmap?lat=${lat}&lng=${lng}` : null,
          neighbors: { count: within, nearest: nearest ? streetOf(nearest.a) : null },
          source: 'NOAA NEXRAD (NCEI SWDI) + NWS/SPC reports, multi-source corroborated',
        },
      });
    } catch (err) {
      console.error('[roofcheck] lead error:', err);
      res.json({ ok: false, error: 'Something went wrong — please try again.' });
    }
  });

  // Public, minimal rep card — personalizes the "Contact rep" CTA (name + headshot).
  // Only ?rep=<slug> links hit this; nothing sensitive (same info as the public profile).
  router.get('/api/roofcheck/rep/:slug', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (!slug) { res.json({ ok: false }); return; }
      const r = await pool.query(
        `SELECT name, slug, image_url FROM employee_profiles WHERE slug = $1 AND is_active = true LIMIT 1`,
        [slug],
      );
      const p = r.rows[0];
      if (!p) { res.json({ ok: false }); return; }
      const first = String(p.name || '').trim().split(/\s+/)[0] || p.name || '';
      res.json({ ok: true, name: p.name || null, firstName: first || null, photo: p.image_url || null });
    } catch { res.json({ ok: false }); }
  });

  // Appointment request — attaches a preferred day/time to the lead the homeowner
  // already created (gate step), then runs the shared lead pipeline so the rep gets
  // a Google Calendar invite + appointment email + in-app bell, and CC24 gets the
  // appointment to book (env-skippable). No new local lead row — we UPDATE the
  // existing one, so the dashboard shows the requested slot on the same lead.
  router.post('/api/roofcheck/schedule', async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const leadId = String(b.leadId || '').trim() || null;
      const preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? String(b.date) : null;
      const preferredTime = /^\d{2}:\d{2}$/.test(String(b.time || '')) ? String(b.time) : null;
      if (!preferredDate) { res.json({ ok: false, error: 'Please pick a day.' }); return; }
      const dayLabel = String(b.dayLabel || '').slice(0, 40);
      const windowLabel = String(b.windowLabel || '').slice(0, 40);
      const repSlug = String(b.rep || '').trim().toLowerCase() || null;
      const src = String(b.src || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || null;

      // Identity from the existing lead row (authoritative); fall back to the body.
      let name = String(b.name || '').trim();
      let phone = String(b.phone || '').trim();
      let email = String(b.email || '').trim();
      let address = String(b.address || '').trim();
      if (leadId) {
        const ex = await pool.query(
          `SELECT homeowner_name, homeowner_phone, homeowner_email, address FROM profile_leads WHERE id = $1 LIMIT 1`,
          [leadId],
        );
        const r0 = ex.rows[0];
        if (r0) {
          name = name || r0.homeowner_name || '';
          phone = phone || r0.homeowner_phone || '';
          email = email || r0.homeowner_email || '';
          address = address || r0.address || '';
        }
        const apptNote = ` | 📅 APPT REQUEST: ${dayLabel || preferredDate}${windowLabel ? ` · ${windowLabel}` : ''}`;
        await pool.query(
          `UPDATE profile_leads SET preferred_date = $1, preferred_time = $2, message = COALESCE(message,'') || $3 WHERE id = $4`,
          [preferredDate, preferredTime, apptNote, leadId],
        );
      }

      // Resolve the rep's profile id so the shared pipeline can notify them.
      let profileId: string | null = null;
      if (repSlug) {
        const pr = await pool.query(`SELECT id FROM employee_profiles WHERE slug = $1 LIMIT 1`, [repSlug]);
        profileId = pr.rows[0]?.id || null;
      }

      // Run the same pipeline the QR contact form uses — now WITH the appointment.
      // This creates a Google Calendar invite on the rep's calendar + an appointment
      // email + in-app bell. CC24 also gets the appointment so the office can book it,
      // unless ROOFCHECK_APPT_TO_CC24=0 — which keeps the rep calendar/email but skips
      // a second CC24 entry (the base lead already forwarded to CC24 at /lead).
      if (name) {
        processLeadIntegrations(profileId, leadId, {
          homeownerName: name,
          homeownerEmail: email || null,
          homeownerPhone: phone || null,
          address: address || null,
          serviceType: 'Inspection appointment request (RoofCheck)',
          preferredDate,
          preferredTime,
          message: `Homeowner requested ${dayLabel || preferredDate}${windowLabel ? ` · ${windowLabel}` : ''} for their free roof inspection.`,
          sourceLabel: `RoofCheck appointment${src ? ` (${src})` : ''}`,
        }, { skipCc24Forward: process.env.ROOFCHECK_APPT_TO_CC24 === '0' });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[roofcheck] schedule error:', err);
      res.json({ ok: false, error: 'Something went wrong — please try again.' });
    }
  });

  return router;
}

export default createRoofCheckRoutes;

// ─────────────────────────────────────────────────────────────────────────────
// Page (inlined so the build needs no asset copy). Dark, atmospheric, "claim-grade"
// storm aesthetic — Roof-ER red. Animated mesh background + hail canvas + radar-sweep
// orb. Fully responsive: split desktop hero / stacked mobile. The white Roof Docs logo
// sits on a dark bar. ${mapsScript} → client Places autocomplete (referrer-restricted,
// safe to expose), graceful free-text + server-geocode fallback. Reads ?rep & ?src.
// ─────────────────────────────────────────────────────────────────────────────
function renderPage(_mapsKey: string, content: ContentMap): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" type="image/png" href="/favicon.png">
<title>Roof-ER — Did the storm hit your roof?</title>
<meta name="description" content="Free 10-second storm check from Roof-ER. See your address-level hail history and whether you qualify for an insurance inspection. VA · MD · PA.">
<meta name="theme-color" content="#0a0a0f">
<meta property="og:title" content="Did the storm hit your roof? — Roof-ER">
<meta property="og:description" content="Free 10-second storm check. Your hail history + insurance eligibility.">
<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500,700&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#08080d;--ink2:#0f0e16;--card:rgba(255,255,255,.05);--line:rgba(255,255,255,.11);
    --red:#ef2b2b;--red2:#ff5a5a;--crimson:#b30606;--steel:#46598a;
    --tx:#f6f4f8;--mut:rgba(246,244,248,.64);--faint:rgba(246,244,248,.42);
    --disp:"Clash Display",-apple-system,BlinkMacSystemFont,sans-serif;
    --body:"Satoshi",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --ok:#34d399;--okbg:rgba(16,185,129,.12);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:var(--ink);color:var(--tx);font-family:var(--body);font-weight:500;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  h1,h2,h3{font-family:var(--disp);font-weight:700;line-height:1.03;letter-spacing:-.02em}
  a{color:inherit;text-decoration:none}
  .grad,.title em{background:linear-gradient(96deg,var(--red2),var(--red) 45%,#ff7a5a);-webkit-background-clip:text;background-clip:text;color:transparent;font-style:normal}

  /* atmosphere */
  .bg{position:fixed;inset:-30%;z-index:0;pointer-events:none;filter:blur(14px);animation:mesh 26s ease-in-out infinite alternate;
    background:
      radial-gradient(40% 52% at 16% 14%,rgba(239,43,43,.40),transparent 60%),
      radial-gradient(44% 54% at 84% 10%,rgba(179,6,6,.46),transparent 62%),
      radial-gradient(52% 56% at 78% 90%,rgba(70,89,138,.34),transparent 60%),
      radial-gradient(48% 62% at 28% 98%,rgba(239,43,43,.30),transparent 62%);}
  @keyframes mesh{0%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-3%,2%,0) scale(1.07)}100%{transform:translate3d(3%,-2%,0) scale(1.03)}}
  #hail{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.5}
  .grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.04;mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
  .wrap{position:relative;z-index:2}
  @media (prefers-reduced-motion:reduce){.bg{animation:none}#hail{display:none}}

  /* nav — dark bar so the white logo reads */
  .nav{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px clamp(18px,5vw,56px);
    position:sticky;top:0;z-index:30;backdrop-filter:blur(14px);background:linear-gradient(180deg,rgba(8,8,13,.9),rgba(8,8,13,.5));border-bottom:1px solid var(--line)}
  .nav img{height:26px;display:block}
  .nav .badge{font-family:var(--disp);font-weight:600;font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);
    border:1px solid var(--line);border-radius:999px;padding:6px 13px}
  .nav .call{font-weight:700;font-size:14px;color:var(--tx);display:flex;align-items:center;gap:7px}

  /* hero */
  .hero{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(26px,4.5vw,68px);align-items:center;
    max-width:1280px;margin:0 auto;padding:clamp(30px,5.5vw,76px) clamp(18px,5vw,56px) clamp(34px,5vw,68px)}
  /* min-width:0 so wide nowrap content (day chips) can't blow out the grid track on mobile */
  .hero>*{min-width:0}
  .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--red2);margin-bottom:16px}
  .eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--red2);box-shadow:0 0 0 4px rgba(239,43,43,.22);animation:pulse 2.2s infinite}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(239,43,43,.22)}50%{box-shadow:0 0 0 9px rgba(239,43,43,0)}}
  h1.title{font-size:clamp(2.5rem,5.4vw,4.3rem)}
  .sub{font-size:clamp(1.02rem,1.5vw,1.28rem);color:var(--mut);max-width:36ch;margin:18px 0 0;line-height:1.5}

  /* glass capture card */
  .card{margin-top:26px;border-radius:22px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025));
    backdrop-filter:blur(16px);box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);padding:clamp(18px,2.4vw,26px);min-width:0;max-width:100%}
  form.search{display:flex;gap:10px;flex-wrap:wrap}
  input{font:inherit;color:var(--tx)}
  input[type=text],input[type=tel],input[type=email]{flex:1;min-width:0;width:100%;padding:15px 16px;border:1.5px solid var(--line);border-radius:13px;
    background:rgba(255,255,255,.04);color:var(--tx);font-size:16px;transition:border-color .2s,background .2s}
  input::placeholder{color:var(--faint)}
  input:focus{outline:none;border-color:var(--red);background:rgba(255,255,255,.07)}
  .btn{font-family:var(--disp);background:linear-gradient(95deg,var(--red),#ff6a4d);color:#fff;border:0;border-radius:13px;padding:15px 22px;font-weight:700;font-size:1rem;
    cursor:pointer;white-space:nowrap;box-shadow:0 14px 34px rgba(239,43,43,.4);transition:transform .18s,box-shadow .18s}
  .btn:hover{transform:translateY(-2px);box-shadow:0 20px 46px rgba(239,43,43,.55)}
  .btn:disabled{opacity:.6;transform:none}
  .btn.full{width:100%;margin-top:11px;padding:16px}
  .muted{color:var(--mut);font-size:13.5px}
  .hint{color:var(--mut);font-size:13.5px;margin-top:11px;display:flex;align-items:center;gap:7px}
  .field{margin-top:10px}
  .gate,.reward{display:none}

  .teaser{display:flex;gap:13px;align-items:flex-start;padding:15px;border-radius:14px;margin:6px 0 14px;background:rgba(239,43,43,.10);border:1px solid rgba(239,43,43,.32)}
  .teaser .ic{font-size:26px;line-height:1}.teaser b{display:block;font-size:16.5px;margin-bottom:2px;color:var(--tx)}
  .teaser div{color:var(--mut);font-size:14px}
  .unlock h3{font-size:17px;margin-bottom:4px}.unlock .muted{margin-bottom:4px}

  /* trust */
  .trust{display:flex;gap:9px;flex-wrap:wrap;margin-top:20px}
  .trust span{font-family:var(--disp);font-weight:600;font-size:13.5px;color:var(--mut);padding:8px 15px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03)}
  .trust span b{color:var(--tx)}

  /* radar orb */
  .art{position:relative;justify-self:center;width:min(440px,86vw);aspect-ratio:1}
  .radar{position:absolute;inset:0;border-radius:50%;overflow:hidden;border:1px solid var(--line);
    background:radial-gradient(circle at 50% 50%,rgba(70,89,138,.16),rgba(8,8,13,.4) 70%);box-shadow:0 40px 110px rgba(179,6,6,.45),inset 0 0 60px rgba(0,0,0,.6)}
  .radar .ring{position:absolute;inset:14%;border:1px solid rgba(255,255,255,.10);border-radius:50%}
  .radar .ring.r2{inset:30%}.radar .ring.r3{inset:46%}
  .radar .cross,.radar .cross.v{position:absolute;background:rgba(255,255,255,.08)}
  .radar .cross{left:0;right:0;top:50%;height:1px}.radar .cross.v{top:0;bottom:0;left:50%;width:1px}
  .radar .sweep{position:absolute;inset:0;border-radius:50%;
    background:conic-gradient(from 0deg,rgba(239,43,43,.55),rgba(239,43,43,0) 24%,rgba(239,43,43,0) 100%);animation:spin 4.5s linear infinite;mix-blend-mode:screen}
  @keyframes spin{to{transform:rotate(360deg)}}
  .blip{position:absolute;width:11px;height:11px;border-radius:50%;background:var(--red2);box-shadow:0 0 14px var(--red2);transform:translate(-50%,-50%);animation:blip 4.5s infinite}
  .blip.b1{left:64%;top:38%;animation-delay:.4s}.blip.b2{left:40%;top:62%;animation-delay:1.7s}.blip.b3{left:58%;top:70%;animation-delay:2.9s}
  @keyframes blip{0%,12%{opacity:0;transform:translate(-50%,-50%) scale(.4)}18%{opacity:1;transform:translate(-50%,-50%) scale(1)}55%{opacity:.5}100%{opacity:0}}
  .art .float{position:absolute;display:flex;align-items:center;gap:9px;padding:12px 16px;border-radius:15px;font-family:var(--disp);font-weight:700;
    background:linear-gradient(95deg,rgba(20,18,28,.92),rgba(20,18,28,.7));border:1px solid var(--line);backdrop-filter:blur(8px);box-shadow:0 18px 44px rgba(0,0,0,.5);animation:float 5.5s ease-in-out infinite}
  .art .float .n{font-size:1.45rem;background:linear-gradient(95deg,var(--red2),#ff8a5a);-webkit-background-clip:text;background-clip:text;color:transparent}
  .art .float .l{font-size:11.5px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.08em;line-height:1.2}
  .art .f1{left:-6%;bottom:14%}.art .f2{right:-4%;top:12%;animation-delay:1.4s}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)}}

  /* reward */
  .rwd-h{font-family:var(--disp);font-size:1.15rem;font-weight:700;margin:2px 0 12px;display:flex;align-items:center;gap:8px}
  .rwd-map{width:100%;border-radius:14px;border:1px solid var(--line);margin-bottom:13px;display:block;box-shadow:0 14px 40px rgba(0,0,0,.4)}
  .ev{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--line);border-radius:13px;margin-top:9px;background:rgba(255,255,255,.03)}
  .ev .l{display:flex;flex-direction:column;gap:2px}.ev .d{font-weight:700;display:flex;align-items:center;gap:8px}.ev .w{font-size:12px;color:var(--faint)}
  .ev .m{font-family:var(--disp);color:var(--red2);font-weight:700;white-space:nowrap;font-size:1.02rem}
  .ev.dh{border-color:rgba(239,43,43,.42);background:rgba(239,43,43,.10)}
  .tag{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#fff;background:var(--red);border-radius:6px;padding:2px 7px}
  .qual{background:var(--okbg);border:1px solid rgba(16,185,129,.4);color:var(--ok);border-radius:13px;padding:13px 15px;margin-top:13px;font-weight:700;font-family:var(--disp)}
  .nb{background:rgba(70,89,138,.14);border:1px solid rgba(70,89,138,.4);border-radius:13px;padding:13px 15px;margin-top:11px;font-weight:600;color:var(--tx)}
  .src{font-size:11.5px;color:var(--faint);margin-top:11px}
  .next{background:rgba(239,43,43,.08);border:1px dashed rgba(239,43,43,.4);border-radius:14px;padding:15px;margin-top:14px;color:var(--mut)}
  .next b{color:var(--tx)}

  footer{border-top:1px solid var(--line);max-width:1280px;margin:30px auto 0;padding:28px clamp(18px,5vw,56px) 44px}
  .foot-row{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px}
  .foot-row img{height:22px;opacity:.9}
  .foot-fine{color:var(--faint);font-size:12.5px;line-height:1.6;max-width:88ch}
  .ao-sig{display:flex;align-items:center;gap:7px;margin-top:16px;opacity:.85}
  .ao-sig img{height:24px;width:auto;display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
  .ao-sig span{font-family:Georgia,'Times New Roman',serif;font-size:9.5px;letter-spacing:.04em;color:var(--faint)}
  .spin-i{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-3px}
  .ac-wrap{flex:1;min-width:0;position:relative}
  .ac-box{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:50;display:none;max-height:282px;overflow:auto;
    background:#15131d;border:1px solid var(--line);border-radius:13px;box-shadow:0 18px 50px rgba(0,0,0,.6)}
  .ac-item{padding:11px 14px;font-size:14.5px;color:var(--mut);cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);text-align:left}
  .ac-item:last-child{border-bottom:0}.ac-item.on,.ac-item:hover{background:rgba(239,43,43,.12);color:var(--tx)}
  .reveal{opacity:0;transform:translateY(20px);animation:rise .7s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes rise{to{opacity:1;transform:none}}

  /* nav CTA → opens the contact / sign-up sheet */
  .navcta{font-family:var(--disp);font-weight:700;font-size:14px;color:#fff;cursor:pointer;
    background:linear-gradient(95deg,var(--red),#ff6a4d);border:0;border-radius:999px;padding:9px 18px;
    box-shadow:0 8px 22px rgba(239,43,43,.4);transition:transform .16s,box-shadow .16s;white-space:nowrap}
  .navcta:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(239,43,43,.55)}

  /* contact sheet (modal) */
  .sheet-ov{display:none;position:fixed;inset:0;z-index:100;background:rgba(4,4,8,.66);backdrop-filter:blur(6px);
    align-items:center;justify-content:center;padding:18px}
  .sheet{position:relative;width:100%;max-width:440px;border-radius:22px;border:1px solid var(--line);
    background:linear-gradient(180deg,#16131d,#100e16);box-shadow:0 40px 110px rgba(0,0,0,.7);padding:clamp(20px,3vw,30px)}
  .sheet-x{position:absolute;top:13px;right:15px;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);
    background:rgba(255,255,255,.05);color:var(--mut);font-size:22px;line-height:1;cursor:pointer}
  .sheet-x:hover{color:var(--tx);background:rgba(255,255,255,.1)}
  .sheet h3{font-size:1.4rem;margin-bottom:6px}
  .sheet-rep{display:flex;align-items:center;gap:11px;margin-bottom:14px}
  .sheet-rep img{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--red)}
  .sheet-rep span{font-family:var(--disp);font-weight:700;font-size:15px}
  .sheet-done{display:none;background:var(--okbg);border:1px solid rgba(16,185,129,.4);border-radius:14px;padding:16px;font-family:var(--disp);font-weight:700}

  /* in-reward scheduler */
  .sched{background:rgba(239,43,43,.08);border:1px solid rgba(239,43,43,.32);border-radius:16px;padding:16px;margin-top:14px}
  .sched-h{font-family:var(--disp);font-size:1.15rem;font-weight:700;display:flex;align-items:center;gap:8px}
  .sched .muted{margin:3px 0 12px}
  .sched-lbl{font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin:6px 0 7px}
  .sched-days{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
  .sched-wins{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
  .chip{font-family:var(--body);font-weight:600;font-size:13.5px;color:var(--mut);cursor:pointer;
    background:rgba(255,255,255,.04);border:1.5px solid var(--line);border-radius:12px;padding:10px 13px;
    white-space:nowrap;transition:border-color .15s,background .15s,color .15s;text-align:center}
  .sched-days .chip{flex:0 0 auto}
  .sched-wins .chip{display:flex;flex-direction:column;gap:2px;line-height:1.15}
  .chip .cw{font-size:11px;font-weight:500;color:var(--faint)}
  .chip:hover{border-color:rgba(239,43,43,.45);color:var(--tx)}
  .chip.on{border-color:var(--red);background:rgba(239,43,43,.16);color:#fff}
  .chip.on .cw{color:rgba(255,255,255,.8)}
  .sched-ok{background:var(--okbg);border:1px solid rgba(16,185,129,.4);border-radius:13px;padding:15px;font-family:var(--disp);font-weight:700;color:var(--ok)}
  .sched-ok b{color:var(--tx)}

  /* ── responsive: real desktop vs phone ── */
  @media (max-width:880px){
    .hero{grid-template-columns:1fr;text-align:center;gap:18px;padding-top:24px}
    .sub{margin-left:auto;margin-right:auto}
    .trust{justify-content:center}
    .art{order:-1;width:min(300px,72vw);margin:0 auto 4px}
    .art .float{display:none}
    .nav .badge{display:none}
    form.search{flex-direction:column}.btn{width:100%}
  }
  @media (max-width:420px){ h1.title{font-size:2.15rem} .card{margin-top:18px} }
</style>
</head>
<body>
  <div class="bg"></div>
  <canvas id="hail"></canvas>
  <div class="grain"></div>
  <div class="wrap">
    <nav class="nav">
      <img id="rc-logo" src="https://www.theroofdocs.com/wp-content/uploads/2025/03/logo_footer_alt.0cc2e436.png" alt="Roof-ER · The Roof Docs">
      <span class="badge">Free Storm Roof Check</span>
      <button class="navcta" id="contactBtn" type="button">Contact rep</button>
    </nav>

    <main class="hero">
      <section class="left">
        <span class="eyebrow"><span class="dot"></span> ${markEm(pc(content, 'roofcheck', 'hero_eyebrow'))}</span>
        <h1 class="title">${markEm(pc(content, 'roofcheck', 'hero_h1'))}</h1>
        <p class="sub">${markEm(pc(content, 'roofcheck', 'hero_sub'))}</p>

        <div class="card">
          <form class="search" id="searchForm" autocomplete="off">
            <div class="ac-wrap">
              <input type="text" id="addr" placeholder="123 Main St, Vienna, VA 22180" aria-label="Your home address" autocomplete="off" required>
              <div id="acBox" class="ac-box"></div>
            </div>
            <button class="btn" id="goBtn" type="submit">${markEm(pc(content, 'roofcheck', 'hero_cta'))} &rarr;</button>
          </form>
          <p class="hint" id="hint">🔒 Free, no obligation. We never share your info.</p>

          <div class="gate" id="gate">
            <div class="teaser" id="teaser"></div>
            <div class="unlock">
              <h3>See your full 2-year storm history</h3>
              <p class="muted">Every hail &amp; wind event on record for your address, plus whether your claim window is open. A Roof-ER specialist follows up within 24 hours.</p>
              <form id="leadForm">
                <div class="field"><input type="text" id="name" placeholder="Your name" required></div>
                <div class="field"><input type="tel" id="phone" placeholder="Phone" required></div>
                <div class="field"><input type="email" id="email" placeholder="Email (optional)"></div>
                <button class="btn full" id="leadBtn" type="submit">Show my storm history &rarr;</button>
              </form>
            </div>
          </div>

          <div class="reward" id="reward"></div>
        </div>

        ${sec(content, 'roofcheck', 'show_trust') ? `<div class="trust"><span><b>8,000+</b> projects completed</span><span>We handle the insurance claim</span><span>Licensed &amp; local</span></div>` : ''}
      </section>

      <aside class="art">
        <div class="radar">
          <div class="ring"></div><div class="ring r2"></div><div class="ring r3"></div>
          <div class="cross"></div><div class="cross v"></div>
          <div class="sweep"></div>
          <span class="blip b1"></span><span class="blip b2"></span><span class="blip b3"></span>
        </div>
        <div class="float f1"><span class="n">8,000+</span><span class="l">roofs<br>completed</span></div>
        <div class="float f2"><span class="n">VA·MD·PA</span><span class="l">storm<br>coverage</span></div>
      </aside>
    </main>

    <footer>
      <div class="foot-row">
        <img src="https://www.theroofdocs.com/wp-content/uploads/2025/03/logo_footer_alt.0cc2e436.png" alt="Roof-ER">
        <span class="muted" style="font-size:13px">storm-damage roofing &amp; insurance-claim experts</span>
      </div>
      <p class="foot-fine">Roof&#8209;ER / The Roof Docs — serving Virginia, Maryland &amp; Pennsylvania (the DMV, Richmond &amp; PA areas). This is a free storm-history check, not a damage assessment — the full assessment happens at your on-site inspection. Storm data: NOAA NEXRAD (NCEI SWDI) + NWS/SPC, multi-source corroborated.</p>
      <div class="ao-sig"><img src="/brand/ao21-sig.png" alt="Susan 21 · AO21" width="34" height="24" loading="lazy"><span>Susan&nbsp;21</span></div>
    </footer>

    <div class="sheet-ov" id="sheetOv">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <button class="sheet-x" id="sheetX" type="button" aria-label="Close">&times;</button>
        <div class="sheet-rep" id="sheetRep"></div>
        <h3 id="sheetTitle">Get in touch with Roof&#8209;ER</h3>
        <p class="muted" id="sheetSub">Leave your info and a local specialist will reach out — free, no obligation.</p>
        <form id="contactForm" autocomplete="on">
          <div class="field"><input type="text" id="cName" placeholder="Your name" autocomplete="name" required></div>
          <div class="field"><input type="tel" id="cPhone" placeholder="Phone" autocomplete="tel" required></div>
          <div class="field"><input type="email" id="cEmail" placeholder="Email (optional)" autocomplete="email"></div>
          <div class="field"><input type="text" id="cAddr" placeholder="Property address (optional)" autocomplete="street-address"></div>
          <button class="btn full" id="cBtn" type="submit">Request a callback &rarr;</button>
        </form>
        <div class="sheet-done" id="sheetDone"></div>
      </div>
    </div>
  </div>

<script>
(function(){
  var ctx={}, $=function(id){return document.getElementById(id);};
  var P=new URLSearchParams(location.search); var REP=P.get('rep')||''; var SRC=P.get('src')||'';
  var REPNAME='', sc={};
  function esc(s){return String(s==null?'':s).replace(/[<>&]/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;'}[c];});}

  /* hail canvas — light, respects reduced motion */
  (function(){
    var c=$('hail'); if(!c) return;
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches){c.style.display='none';return;}
    var x=c.getContext('2d'),w,h,drops=[];
    function size(){w=c.width=innerWidth;h=c.height=innerHeight;var n=Math.min(150,Math.floor(w/9));drops=[];for(var i=0;i<n;i++)drops.push({x:Math.random()*w,y:Math.random()*h,l:6+Math.random()*16,s:5+Math.random()*9,o:.12+Math.random()*.3});}
    size(); addEventListener('resize',size);
    (function loop(){x.clearRect(0,0,w,h);x.lineCap='round';for(var i=0;i<drops.length;i++){var d=drops[i];x.strokeStyle='rgba(255,140,140,'+d.o+')';x.lineWidth=1.4;x.beginPath();x.moveTo(d.x,d.y);x.lineTo(d.x-1.5,d.y+d.l);x.stroke();d.y+=d.s;d.x-=.6;if(d.y>h){d.y=-d.l;d.x=Math.random()*w;}}requestAnimationFrame(loop);})();
  })();

  /* Address autocomplete — Photon (OpenStreetMap, keyless), custom dropdown.
     On pick we get lat/lng directly; if they keep typing we re-geocode server-side. */
  (function(){
    var inp=$('addr'), box=$('acBox'), items=[], sel=-1, tmr=null, lastQ='';
    function hide(){ box.style.display='none'; sel=-1; }
    function pick(it){ if(!it) return; inp.value=it.label; ctx.lat=it.lat; ctx.lng=it.lng; ctx.normalizedAddress=it.label; hide(); }
    function render(){
      if(!items.length){ hide(); return; }
      box.innerHTML=items.map(function(it,i){ return '<div class="ac-item'+(i===sel?' on':'')+'" data-i="'+i+'">'+esc(it.label)+'</div>'; }).join('');
      box.style.display='block';
    }
    function fmt(p){
      var a=[p.housenumber,p.street||p.name].filter(Boolean).join(' ');
      var b=[p.city||p.district,p.state,p.postcode].filter(Boolean).join(', ');
      return [a,b].filter(Boolean).join(', ');
    }
    async function search(q){
      try{
        var r=await fetch('https://photon.komoot.io/api/?lang=en&limit=7&lat=38.9&lon=-77.1&q='+encodeURIComponent(q));
        var d=await r.json();
        items=(d.features||[]).filter(function(f){var c=f.properties||{};return (c.countrycode==='US'||c.country==='United States')&&(c.housenumber||c.street);})
          .map(function(f){var p=f.properties||{},g=f.geometry||{};return {label:fmt(p),lat:g.coordinates?g.coordinates[1]:null,lng:g.coordinates?g.coordinates[0]:null};})
          .filter(function(it){return it.lat&&it.label;}).slice(0,6);
        render();
      }catch(e){ hide(); }
    }
    inp.addEventListener('input',function(){
      ctx.lat=null; ctx.lng=null;
      var q=inp.value.trim(); if(q.length<4){ hide(); return; }
      clearTimeout(tmr); tmr=setTimeout(function(){ if(q!==lastQ){ lastQ=q; search(q); } },240);
    });
    inp.addEventListener('keydown',function(e){
      if(box.style.display!=='block') return;
      if(e.key==='ArrowDown'){ e.preventDefault(); sel=Math.min(sel+1,items.length-1); render(); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); sel=Math.max(sel-1,0); render(); }
      else if(e.key==='Enter'&&sel>=0){ e.preventDefault(); pick(items[sel]); }
      else if(e.key==='Escape'){ hide(); }
    });
    box.addEventListener('mousedown',function(e){ var t=e.target.closest('.ac-item'); if(t){ e.preventDefault(); pick(items[+t.dataset.i]); } });
    inp.addEventListener('blur',function(){ setTimeout(hide,160); });
  })();

  $('searchForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var a=$('addr').value.trim(); if(!a) return;
    var b=$('goBtn'); b.disabled=true; b.innerHTML='<span class="spin-i"></span>';
    $('hint').innerHTML='Scanning storm data for your address…';
    try{
      var body={address:ctx.normalizedAddress||a};
      if(ctx.lat&&ctx.lng){ body.lat=ctx.lat; body.lng=ctx.lng; }
      var r=await fetch('/api/roofcheck/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      var d=await r.json();
      if(!d.ok){ $('hint').textContent=d.error||"We couldn't find that address — add city & ZIP."; return; }
      ctx.lat=d.lat; ctx.lng=d.lng; ctx.normalizedAddress=d.normalizedAddress||a;
      var t=d.teaser||{};
      $('teaser').innerHTML = t.got
        ? '<div class="ic">&#9888;&#65039;</div><div><b>Your address was in a storm path.</b>Enter your details to see <b>when</b> it hit, <b>how big</b> the hail was, and whether you <b>qualify</b> for an insurance-paid roof.</div>'
        : '<div class="ic">&#127783;&#65039;</div><div><b>Let\\'s check your address for storm damage.</b>Enter your details to see your full 2-year hail &amp; wind history and insurance eligibility.</div>';
      $('gate').style.display='block'; $('gate').classList.add('reveal');
      $('gate').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(err){ $('hint').textContent='Something went wrong — please try again.'; }
    finally{ b.disabled=false; b.innerHTML='Check my roof &rarr;'; }
  });

  $('leadForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name=$('name').value.trim(), phone=$('phone').value.trim(), email=$('email').value.trim();
    if(!name||phone.replace(/\\D/g,'').length<7){ alert('Please enter your name and phone.'); return; }
    var b=$('leadBtn'); b.disabled=true; b.innerHTML='<span class="spin-i"></span>';
    ctx.name=name; ctx.phone=phone; ctx.email=email;
    try{
      var r=await fetch('/api/roofcheck/lead',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:name,phone:phone,email:email,address:ctx.normalizedAddress||$('addr').value.trim(),lat:ctx.lat,lng:ctx.lng,rep:REP,src:SRC})});
      var d=await r.json();
      if(!d.ok){ b.disabled=false; b.innerHTML='Show my storm history &rarr;'; alert(d.error||'Please try again.'); return; }
      ctx.leadId=d.leadId||null;
      renderReward(d.reward||{});
    }catch(err){ b.disabled=false; b.innerHTML='Show my storm history &rarr;'; alert('Please try again.'); }
  });

  function renderReward(rw){
    var h='<div class="rwd-h">📋 Your storm history — last 2 years</div>';
    if(rw.map) h+='<img class="rwd-map" alt="Your roof" src="'+esc(rw.map)+'" onerror="this.style.display=\\'none\\'">';
    var evs=rw.events||[];
    if(evs.length){
      evs.forEach(function(e){
        h+='<div class="ev '+(e.direct?'dh':'')+'"><div class="l"><span class="d">'+esc(e.date)+(e.direct?'<span class="tag">At your home</span>':'')+'</span><span class="w">'+esc(e.where)+'</span></div><span class="m">'+esc(e.mag)+'</span></div>';
      });
    } else {
      h+='<div class="ev"><div class="l"><span class="d">No major events on record in the last 2 years</span></div></div>';
    }
    if(rw.qualifying) h+='<div class="qual">&#10003; Qualifying event — your insurance claim window is open. This is worth a free inspection.</div>';
    if(rw.neighbors&&rw.neighbors.count>0) h+='<div class="nb">&#127968; We\\'ve completed '+rw.neighbors.count+' roof'+(rw.neighbors.count==1?'':'s')+' within a mile of you'+(rw.neighbors.nearest?(' — including one on '+esc(rw.neighbors.nearest)):'')+'.</div>';
    h+='<div class="src">Source: '+esc(rw.source||'NOAA NEXRAD (NCEI SWDI) + NWS/SPC')+'</div>';
    h+='<div class="sched" id="sched">'
      +'<div class="sched-h">📅 Book your free inspection</div>'
      +'<p class="muted">The full damage assessment + insurance documentation happens on-site. Pick a day &amp; time that works — '+(REPNAME?esc(REPNAME):'your Roof-ER specialist')+' will confirm.</p>'
      +'<div class="sched-lbl">Choose a day</div><div class="sched-days" id="schedDays"></div>'
      +'<div class="sched-lbl">Choose a time</div><div class="sched-wins" id="schedWins"></div>'
      +'<button class="btn full" id="schedBtn" type="button" disabled>Pick a day &amp; time</button>'
      +'</div>';
    h+='<div style="margin-top:18px;padding:16px 18px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.03)">'
      +'<div style="font-weight:700;font-size:14px;margin-bottom:10px">&#128203; Your storm-damage claim checklist</div>'
      +'<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.7;color:rgba(255,255,255,.8)">'
      +'<li><b>Document everything</b> &mdash; date-stamped photos of every slope, the gutters, and any interior stains before you call.</li>'
      +'<li><b>File within your window</b> &mdash; most insurers require the claim within about a year of the storm date.</li>'
      +'<li><b>Be there for the adjuster</b> &mdash; walk the roof with them and point out every hit.</li>'
      +'<li><b>Ask for a supplement</b> &mdash; the first estimate is rarely complete; itemize anything missing.</li>'
      +'<li><b>Vet your contractor</b> &mdash; licensed, insured, GAF-certified, and local (not a storm-chaser).</li>'
      +'</ul></div>';
    $('gate').style.display='none';
    $('reward').innerHTML=h; $('reward').style.display='block'; $('reward').classList.add('reveal');
    buildScheduler();
    $('reward').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  /* In-reward scheduler — homeowner picks a day + time window for the on-site
     inspection; posts to /api/roofcheck/schedule which attaches it to their lead
     and books it in CC24. */
  function buildScheduler(){
    var days=$('schedDays'), wins=$('schedWins'), btn=$('schedBtn'); if(!days||!wins||!btn) return;
    sc={};
    var WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function pad(n){ return (n<10?'0':'')+n; }
    var t=new Date(), dh='';
    for(var i=1;i<=10;i++){
      var dt=new Date(t.getFullYear(),t.getMonth(),t.getDate()+i);
      var iso=dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());
      var lbl=WD[dt.getDay()]+' '+MO[dt.getMonth()]+' '+dt.getDate();
      dh+='<button type="button" class="chip" data-iso="'+iso+'" data-lbl="'+esc(lbl)+'">'+esc(lbl)+'</button>';
    }
    days.innerHTML=dh;
    var WINS=[['Morning','08:00','8–11am'],['Midday','11:00','11am–2pm'],['Afternoon','14:00','2–5pm'],['Evening','17:00','5–7pm']];
    wins.innerHTML=WINS.map(function(w){ return '<button type="button" class="chip" data-time="'+w[1]+'" data-wlbl="'+esc(w[0]+' ('+w[2]+')')+'">'+w[0]+'<span class="cw">'+w[2]+'</span></button>'; }).join('');
    function refresh(){
      var ok=sc.iso&&sc.time;
      btn.disabled=!ok;
      btn.innerHTML=ok?'Lock in '+esc(sc.dayLbl)+', '+esc(sc.winShort):'Pick a day &amp; time';
    }
    days.addEventListener('click',function(e){ var c=e.target.closest('.chip'); if(!c) return;
      [].forEach.call(days.children,function(x){x.classList.remove('on');}); c.classList.add('on');
      sc.iso=c.getAttribute('data-iso'); sc.dayLbl=c.getAttribute('data-lbl'); refresh(); });
    wins.addEventListener('click',function(e){ var c=e.target.closest('.chip'); if(!c) return;
      [].forEach.call(wins.children,function(x){x.classList.remove('on');}); c.classList.add('on');
      sc.time=c.getAttribute('data-time'); sc.wlbl=c.getAttribute('data-wlbl'); sc.winShort=c.firstChild.textContent; refresh(); });
    btn.addEventListener('click',async function(){
      if(!sc.iso||!sc.time) return;
      btn.disabled=true; btn.innerHTML='<span class="spin-i"></span>';
      try{
        var r=await fetch('/api/roofcheck/schedule',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({leadId:ctx.leadId,date:sc.iso,time:sc.time,dayLabel:sc.dayLbl,windowLabel:sc.wlbl,
            name:ctx.name,phone:ctx.phone,email:ctx.email,address:ctx.normalizedAddress,rep:REP,src:SRC})});
        var d=await r.json();
        if(!d.ok){ btn.disabled=false; refresh(); alert(d.error||'Please try again.'); return; }
        $('sched').innerHTML='<div class="sched-ok">✅ <b>You\\'re booked for '+esc(sc.dayLbl)+', '+esc(sc.wlbl)+'.</b>'
          +'<div class="muted" style="margin-top:6px;font-family:var(--body);font-weight:500">'+(REPNAME?esc(REPNAME):'A Roof-ER specialist')+' will call to confirm. Keep an eye on your phone! 📞</div></div>';
      }catch(e){ btn.disabled=false; refresh(); alert('Please try again.'); }
    });
  }

  /* Rep personalization + contact / sign-up sheet (top-right "Contact rep"). */
  if(REP){
    fetch('/api/roofcheck/rep/'+encodeURIComponent(REP)).then(function(r){return r.json();}).then(function(d){
      if(!d||!d.ok) return;
      REPNAME=d.firstName||d.name||'';
      var cb=$('contactBtn'); if(cb&&REPNAME) cb.textContent='Contact '+REPNAME;
      if(d.name){ var st=$('sheetTitle'); if(st) st.textContent='Talk to '+d.name; }
      var ss=$('sheetSub'); if(ss) ss.textContent=(d.firstName||'Your rep')+' is your local Roof-ER specialist — leave your info and they\\'ll reach out.';
      if(d.photo){ var sr=$('sheetRep'); if(sr) sr.innerHTML='<img src="'+esc(d.photo)+'" alt="'+esc(d.name||'')+'" onerror="this.style.display=\\'none\\'"><span>'+esc(d.name||'')+'</span>'; }
    }).catch(function(){});
  }
  (function(){
    var ov=$('sheetOv'); if(!ov) return;
    function open(){ ov.style.display='flex'; var a=$('cAddr'); if(a&&!a.value&&$('addr')) a.value=$('addr').value.trim(); setTimeout(function(){var n=$('cName'); if(n) n.focus();},60); }
    function close(){ ov.style.display='none'; }
    $('contactBtn').addEventListener('click',open);
    $('sheetX').addEventListener('click',close);
    ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&ov.style.display==='flex') close(); });
    $('contactForm').addEventListener('submit',async function(e){
      e.preventDefault();
      var name=$('cName').value.trim(), phone=$('cPhone').value.trim(), email=$('cEmail').value.trim(), addr=$('cAddr').value.trim();
      if(!name||phone.replace(/\\D/g,'').length<7){ alert('Please enter your name and phone.'); return; }
      var b=$('cBtn'); b.disabled=true; b.innerHTML='<span class="spin-i"></span>';
      try{
        var r=await fetch('/api/roofcheck/lead',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:name,phone:phone,email:email,address:addr,lat:ctx.lat,lng:ctx.lng,rep:REP,src:SRC||'contact'})});
        var d=await r.json();
        if(!d.ok){ b.disabled=false; b.innerHTML='Request a callback &rarr;'; alert(d.error||'Please try again.'); return; }
        $('contactForm').style.display='none';
        var done=$('sheetDone');
        done.innerHTML='✅ Thanks, '+esc(name.split(' ')[0])+'!<div class="muted" style="margin-top:6px;font-family:var(--body);font-weight:500">'+(REPNAME?esc(REPNAME):'A Roof-ER specialist')+' will reach out shortly.</div>';
        done.style.display='block';
      }catch(err){ b.disabled=false; b.innerHTML='Request a callback &rarr;'; alert('Please try again.'); }
    });
  })();
})();
</script>
  <!-- Brand audio identity: music bed + heartbeat (matches the rep videos & promo) -->
  <audio id="ra-bgm" loop preload="none" src="/roofcheck/brand-bed.mp3"></audio>
  <audio id="ra-hb" preload="auto" src="/roofcheck/hb.mp3"></audio>
  <button id="ra-mute" type="button" aria-label="Toggle sound"><span id="ra-ico">🔊</span><span id="ra-lbl">Tap for sound</span></button>
  <style>
    #ra-mute{ position:fixed; right:16px; bottom:16px; z-index:70; display:flex; align-items:center; gap:8px;
      padding:11px 15px; font:600 13px/1 system-ui,-apple-system,sans-serif; letter-spacing:.3px; color:#fff;
      background:rgba(12,12,14,.74); border:1px solid rgba(255,255,255,.18); border-radius:999px; cursor:pointer;
      -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); box-shadow:0 6px 22px rgba(0,0,0,.45);
      transition:transform .15s, background .2s, opacity .35s; opacity:0; }
    #ra-mute.ready{ opacity:1; }
    #ra-mute.idle{ animation:raNudge 2.6s ease-in-out infinite; }
    #ra-mute:hover{ transform:translateY(-2px); background:rgba(183,8,8,.92); }
    @keyframes raNudge{ 0%,100%{ box-shadow:0 6px 22px rgba(0,0,0,.45);} 50%{ box-shadow:0 6px 26px rgba(183,8,8,.7);} }
    #rc-logo.rc-beat{ animation:rcBeat .85s ease-out; }
    @keyframes rcBeat{ 0%{transform:scale(1)} 18%{transform:scale(1.06); filter:drop-shadow(0 0 14px rgba(183,8,8,.85))} 42%{transform:scale(1)} 56%{transform:scale(1.035); filter:drop-shadow(0 0 9px rgba(183,8,8,.55))} 100%{transform:scale(1); filter:none} }
    @media (max-width:600px){ #ra-mute #ra-lbl{ display:none;} #ra-mute{ padding:12px;} }
  </style>
  <script>
  (function(){
    var bgm=document.getElementById('ra-bgm'), hb=document.getElementById('ra-hb'),
        btn=document.getElementById('ra-mute'), ico=document.getElementById('ra-ico'), lbl=document.getElementById('ra-lbl'),
        logo=document.getElementById('rc-logo');
    var TARGET=0.30, BEAT=14000, started=false, hbTimer=null;
    var muted = localStorage.getItem('roofer-muted')==='1';
    function paint(){ ico.textContent=muted?'🔇':'🔊'; lbl.textContent=muted?'Sound off':(started?'Sound on':'Tap for sound'); btn.classList.toggle('idle', !started && !muted); }
    paint();
    function fade(a,to,ms){ var s=a.volume,t0=performance.now();
      (function step(n){ var k=Math.min(1,(n-t0)/ms); a.volume=Math.max(0,Math.min(1,s+(to-s)*k));
        if(k<1) requestAnimationFrame(step); else if(to===0){ try{a.pause();}catch(e){} } })(t0); }
    function thump(){ if(muted) return; try{ hb.currentTime=0; hb.volume=0.5; hb.play().catch(function(){}); }catch(e){}
      if(logo){ logo.classList.remove('rc-beat'); void logo.offsetWidth; logo.classList.add('rc-beat'); } }
    function startBeat(){ if(hbTimer) return; setTimeout(thump,1100); hbTimer=setInterval(thump,BEAT); }
    function begin(){ if(started||muted) return; started=true; btn.classList.add('ready');
      bgm.volume=0; var p=bgm.play(); if(p&&p.then) p.then(function(){ fade(bgm,TARGET,1300); }).catch(function(){ started=false; });
      else fade(bgm,TARGET,1300); startBeat(); paint(); }
    function onFirst(e){ if(e&&e.target&&e.target.closest&&e.target.closest('#ra-mute')) return; begin(); }
    ['pointerdown','touchstart','wheel','scroll','keydown'].forEach(function(ev){ window.addEventListener(ev,onFirst,{passive:true}); });
    setTimeout(function(){ btn.classList.add('ready'); }, 1400);
    btn.addEventListener('click',function(e){ e.stopPropagation();
      if(muted){ muted=false; localStorage.setItem('roofer-muted','0'); started=false; begin(); }
      else if(!started){ begin(); }
      else { muted=true; localStorage.setItem('roofer-muted','1'); fade(bgm,0,400); if(hbTimer){clearInterval(hbTimer);hbTimer=null;} }
      paint(); });
  })();
  </script>
</body>
</html>`;
}
