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
// Page (inlined so the build needs no asset copy). Roof-ER branded — red palette,
// The Roof Docs logo. ${mapsKey} → client Places autocomplete (referrer-restricted,
// safe to expose); falls back to free-text + server geocode if Maps fails to load.
// Reads ?rep=<slug>&src=<channel> from the URL and threads them into the lead.
// ─────────────────────────────────────────────────────────────────────────────
function renderPage(mapsKey: string): string {
  const mapsScript = mapsKey
    ? `<script src="https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places&callback=initRC" async defer></script>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roof-ER — Did the storm hit your roof?</title>
<meta name="description" content="Free 10-second storm check from Roof-ER. See your 2-year hail history and whether you qualify for an insurance inspection.">
<style>
  :root{--red:#dc2626;--red2:#b60807;--dark:#7a0a0a;--ink:#161413;--mut:#6b7280;--line:#ececef}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#f7f6f5}
  .top{display:flex;align-items:center;justify-content:center;padding:16px;background:#fff;border-bottom:1px solid var(--line)}
  .top img{height:30px}
  .hero{background:linear-gradient(135deg,var(--dark) 0%,var(--red2) 50%,var(--red) 130%);color:#fff;padding:42px 20px 70px;text-align:center}
  .brand{font-weight:800;letter-spacing:.6px;font-size:13px;opacity:.92;text-transform:uppercase}
  h1{font-size:30px;line-height:1.13;margin:14px auto 10px;max-width:640px;font-weight:800}
  .sub{max-width:540px;margin:0 auto 22px;opacity:.95;font-size:17px}
  .trust{max-width:600px;margin:20px auto 0;display:flex;gap:9px;justify-content:center;flex-wrap:wrap;font-size:13px}
  .trust span{background:#ffffff24;padding:6px 12px;border-radius:999px;backdrop-filter:blur(2px)}
  .card{background:#fff;max-width:560px;margin:-50px auto 0;border-radius:18px;box-shadow:0 14px 44px #7a0a0a26;padding:24px}
  form.search{display:flex;gap:8px;flex-wrap:wrap}
  input{font:inherit}
  input[type=text],input[type=email],input[type=tel]{flex:1;min-width:0;padding:14px;border:1.5px solid var(--line);border-radius:12px;width:100%}
  input:focus{outline:none;border-color:var(--red)}
  .btn{background:linear-gradient(135deg,var(--red),#ef4444);color:#fff;border:0;border-radius:12px;padding:14px 18px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 4px 14px #dc262640}
  .btn:disabled{opacity:.6}
  .btn.full{width:100%;margin-top:10px}
  .muted{color:var(--mut);font-size:13.5px}
  .gate,.reward{display:none}
  .teaser{display:flex;gap:13px;align-items:flex-start;padding:15px;border-radius:14px;margin:8px 0 14px;background:#fdeeee;border:1px solid #f7caca}
  .teaser .ic{font-size:26px;line-height:1}.teaser b{display:block;font-size:17px;margin-bottom:2px}
  .unlock h3{font-size:18px;margin-bottom:3px}
  .field{margin-top:9px}
  .rwd-h{font-size:19px;font-weight:800;margin:2px 0 10px;display:flex;align-items:center;gap:7px}
  .rwd-map{width:100%;border-radius:13px;border:1px solid var(--line);margin-bottom:12px;display:block}
  .ev{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--line);border-radius:11px;margin-top:8px}
  .ev .l{display:flex;flex-direction:column}.ev .d{font-weight:700}.ev .w{font-size:12px;color:var(--mut)}
  .ev .m{color:var(--red2);font-weight:800;white-space:nowrap}
  .ev.dh{border-color:#f3b4b4;background:#fdf3f3}
  .tag{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#fff;background:var(--red);border-radius:5px;padding:2px 6px;margin-left:7px}
  .qual{background:#eafaf0;border:1px solid #b9ebcb;color:#0a7c3e;border-radius:12px;padding:12px 14px;margin-top:12px;font-weight:700}
  .nb{background:#fef3ec;border:1px solid #f8d6bd;border-radius:12px;padding:12px 14px;margin-top:10px;font-weight:700;color:#9a3412}
  .src{font-size:12px;color:var(--mut);margin-top:10px}
  .next{background:#fff7f7;border:1px dashed #f3b4b4;border-radius:13px;padding:14px;margin-top:14px}
  .next b{color:var(--red2)}
  footer{max-width:600px;margin:26px auto 40px;text-align:center;color:var(--mut);font-size:12.5px;padding:0 20px}
  .spin{display:inline-block;width:15px;height:15px;border:2px solid #ffffff80;border-top-color:#fff;border-radius:50%;animation:s .7s linear infinite;vertical-align:-2px}
  @keyframes s{to{transform:rotate(360deg)}}
  .pac-container{z-index:99999;border-radius:10px;margin-top:4px;box-shadow:0 8px 24px #0002;border:1px solid var(--line)}
  @media(min-width:560px){h1{font-size:38px}}
</style>
</head>
<body>
  <div class="top"><img src="https://www.theroofdocs.com/wp-content/uploads/2025/03/logo_footer_alt.0cc2e436.png" alt="Roof-ER · The Roof Docs"></div>
  <div class="hero">
    <div class="brand">Roof&#8209;ER &middot; Free Storm Roof Check</div>
    <h1>Did the storm hit your roof?</h1>
    <p class="sub">Enter your address for a free 10-second check — see your 2-year hail history and whether you qualify for an insurance inspection.</p>
    <div class="trust"><span>4,391 roofs completed in the DMV</span><span>We handle the insurance claim</span><span>Licensed &amp; local</span></div>
  </div>

  <div class="card">
    <form class="search" id="searchForm" autocomplete="off">
      <input type="text" id="addr" placeholder="123 Main St, Vienna, VA 22180" aria-label="Your home address" required>
      <button class="btn" id="goBtn" type="submit">Check my roof &rarr;</button>
    </form>
    <p class="muted" id="hint" style="margin-top:9px">Free, no obligation. We never share your info.</p>

    <div class="gate" id="gate">
      <div class="teaser" id="teaser"></div>
      <div class="unlock">
        <h3>See your full 2-year storm history</h3>
        <p class="muted">We'll pull every hail &amp; wind event on record for your address and tell you if your claim window is open. A Roof-ER specialist follows up within 24 hours.</p>
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

  <footer>Roof&#8209;ER / The Roof Docs — storm-damage roofing &amp; insurance-claim experts serving Northern Virginia, Maryland &amp; DC. Storm data: NOAA NEXRAD (NCEI SWDI) + NWS/SPC.</footer>

<script>
(function(){
  var ctx={}, $=function(id){return document.getElementById(id);};
  var P=new URLSearchParams(location.search); var REP=P.get('rep')||''; var SRC=P.get('src')||'';
  function esc(s){return String(s==null?'':s).replace(/[<>&]/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;'}[c];});}

  // Google Places autocomplete (progressive enhancement — input still works without it)
  window.initRC=function(){
    try{
      var ac=new google.maps.places.Autocomplete($('addr'),{types:['address'],componentRestrictions:{country:'us'},fields:['formatted_address','geometry']});
      ac.addListener('place_changed',function(){
        var pl=ac.getPlace();
        if(pl&&pl.geometry&&pl.geometry.location){
          ctx.lat=pl.geometry.location.lat(); ctx.lng=pl.geometry.location.lng();
          ctx.normalizedAddress=pl.formatted_address||$('addr').value;
        }
      });
    }catch(e){}
  };

  $('searchForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var a=$('addr').value.trim(); if(!a) return;
    var b=$('goBtn'); b.disabled=true; b.innerHTML='<span class="spin"></span>';
    $('hint').textContent='Scanning storm data for your address…';
    try{
      var body={address:ctx.normalizedAddress||a};
      if(ctx.lat&&ctx.lng){ body.lat=ctx.lat; body.lng=ctx.lng; }
      var r=await fetch('/api/roofcheck/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      var d=await r.json();
      if(!d.ok){ $('hint').textContent=d.error||"We couldn't find that address — add city & ZIP."; return; }
      ctx.lat=d.lat; ctx.lng=d.lng; ctx.normalizedAddress=d.normalizedAddress||a;
      var t=d.teaser||{};
      $('teaser').innerHTML = t.got
        ? '<div class="ic">&#9888;&#65039;</div><div><b>Your address was in a storm path.</b>Enter your details below to see <b>when</b> it hit, <b>how big</b> the hail was, and whether you <b>qualify</b> for an insurance-paid roof.</div>'
        : '<div class="ic">&#127783;&#65039;</div><div><b>Let\\'s check your address for storm damage.</b>Enter your details to see your full 2-year hail &amp; wind history and insurance eligibility.</div>';
      $('hint').style.display='none'; $('gate').style.display='block';
      $('gate').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(err){ $('hint').textContent='Something went wrong — please try again.'; }
    finally{ b.disabled=false; b.innerHTML='Check my roof &rarr;'; }
  });

  $('leadForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name=$('name').value.trim(), phone=$('phone').value.trim(), email=$('email').value.trim();
    if(!name||phone.replace(/\\D/g,'').length<7){ alert('Please enter your name and phone.'); return; }
    var b=$('leadBtn'); b.disabled=true; b.innerHTML='<span class="spin"></span>';
    try{
      var r=await fetch('/api/roofcheck/lead',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:name,phone:phone,email:email,address:ctx.normalizedAddress||$('addr').value.trim(),lat:ctx.lat,lng:ctx.lng,rep:REP,src:SRC})});
      var d=await r.json();
      if(!d.ok){ b.disabled=false; b.innerHTML='Show my storm history &rarr;'; alert(d.error||'Please try again.'); return; }
      renderReward(d.reward||{});
    }catch(err){ b.disabled=false; b.innerHTML='Show my storm history &rarr;'; alert('Please try again.'); }
  });

  function renderReward(rw){
    var h='<div class="rwd-h">&#128203; Your storm history — last 2 years</div>';
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
    h+='<div class="next">&#128197; <b>Next step:</b> the full damage assessment + insurance documentation happens at your <b>free on-site inspection</b>. A Roof-ER specialist will call within 24 hours to schedule.</div>';
    $('gate').style.display='none';
    $('reward').innerHTML=h; $('reward').style.display='block';
    $('reward').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
})();
</script>
${mapsScript}
</body>
</html>`;
}
