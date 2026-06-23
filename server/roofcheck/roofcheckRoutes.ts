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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { getAddressHailImpactViaHailYes } from '../services/hailYesImpactAdapter.js';
import { fetchMapImage } from '../services/mapImageService.js';

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
  try { return await getAddressHailImpactViaHailYes(lat, lng, 24); }
  catch { return null; }
}

export function createRoofCheckRoutes(pool: Pool) {
  const router = Router();

  router.get('/roofcheck', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Prefer a dedicated referrer-restricted BROWSER key for client autocomplete;
    // never the server key. If neither browser key is set, the page ships without
    // autocomplete (free-text input + server-side geocode still work fine).
    const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    res.send(renderPage(browserKey));
  });

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
      if (repSlug) {
        const pr = await pool.query(`SELECT id FROM employee_profiles WHERE slug = $1 LIMIT 1`, [repSlug]);
        profileId = pr.rows[0]?.id || null;
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

      res.json({
        ok: true,
        leadId: ins.rows[0]?.id || null,
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
function renderPage(mapsKey: string): string {
  const mapsScript = mapsKey
    ? `<script src="https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places&callback=initRC" async defer></script>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
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
  .grad{background:linear-gradient(96deg,var(--red2),var(--red) 45%,#ff7a5a);-webkit-background-clip:text;background-clip:text;color:transparent}

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
  .eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--red2);margin-bottom:16px}
  .eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--red2);box-shadow:0 0 0 4px rgba(239,43,43,.22);animation:pulse 2.2s infinite}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(239,43,43,.22)}50%{box-shadow:0 0 0 9px rgba(239,43,43,0)}}
  h1.title{font-size:clamp(2.5rem,5.4vw,4.3rem)}
  .sub{font-size:clamp(1.02rem,1.5vw,1.28rem);color:var(--mut);max-width:36ch;margin:18px 0 0;line-height:1.5}

  /* glass capture card */
  .card{margin-top:26px;border-radius:22px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025));
    backdrop-filter:blur(16px);box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);padding:clamp(18px,2.4vw,26px)}
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
  .spin-i{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-3px}
  .pac-container{z-index:99999;border-radius:12px;margin-top:6px;background:#15131d;border:1px solid var(--line);box-shadow:0 18px 50px rgba(0,0,0,.6);font-family:var(--body)}
  .pac-item{color:var(--mut);border-color:var(--line);padding:7px 12px}.pac-item:hover{background:rgba(255,255,255,.06)}.pac-item-query{color:var(--tx)}
  .reveal{opacity:0;transform:translateY(20px);animation:rise .7s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes rise{to{opacity:1;transform:none}}

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
      <img src="https://www.theroofdocs.com/wp-content/uploads/2025/03/logo_footer_alt.0cc2e436.png" alt="Roof-ER · The Roof Docs">
      <span class="badge">Free Storm Roof Check</span>
      <a class="call" href="tel:+15715550100">📞 Talk to a specialist</a>
    </nav>

    <main class="hero">
      <section class="left">
        <span class="eyebrow"><span class="dot"></span> Free 10-second storm check</span>
        <h1 class="title">Did the storm hit <span class="grad">your roof?</span></h1>
        <p class="sub">Enter your address and we'll pull your address-level hail history and tell you whether your roof qualifies for an insurance inspection — in seconds.</p>

        <div class="card">
          <form class="search" id="searchForm" autocomplete="off">
            <input type="text" id="addr" placeholder="123 Main St, Vienna, VA 22180" aria-label="Your home address" required>
            <button class="btn" id="goBtn" type="submit">Check my roof &rarr;</button>
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

        <div class="trust"><span><b>8,000+</b> projects completed</span><span>We handle the insurance claim</span><span>Licensed &amp; local</span></div>
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
    </footer>
  </div>

<script>
(function(){
  var ctx={}, $=function(id){return document.getElementById(id);};
  var P=new URLSearchParams(location.search); var REP=P.get('rep')||''; var SRC=P.get('src')||'';
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

  /* Google Places autocomplete — progressive enhancement */
  window.initRC=function(){
    try{
      var ac=new google.maps.places.Autocomplete($('addr'),{types:['address'],componentRestrictions:{country:'us'},fields:['formatted_address','geometry']});
      ac.addListener('place_changed',function(){
        var pl=ac.getPlace();
        if(pl&&pl.geometry&&pl.geometry.location){ctx.lat=pl.geometry.location.lat();ctx.lng=pl.geometry.location.lng();ctx.normalizedAddress=pl.formatted_address||$('addr').value;}
      });
    }catch(e){}
  };

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
    try{
      var r=await fetch('/api/roofcheck/lead',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:name,phone:phone,email:email,address:ctx.normalizedAddress||$('addr').value.trim(),lat:ctx.lat,lng:ctx.lng,rep:REP,src:SRC})});
      var d=await r.json();
      if(!d.ok){ b.disabled=false; b.innerHTML='Show my storm history &rarr;'; alert(d.error||'Please try again.'); return; }
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
    h+='<div class="next">📅 <b>Next step:</b> the full damage assessment + insurance documentation happens at your <b>free on-site inspection</b>. A Roof-ER specialist will call within 24 hours to schedule.</div>';
    $('gate').style.display='none';
    $('reward').innerHTML=h; $('reward').style.display='block'; $('reward').classList.add('reveal');
    $('reward').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
})();
</script>
${mapsScript}
</body>
</html>`;
}
