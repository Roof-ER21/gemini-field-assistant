// @ts-nocheck
/**
 * Content Studio — DB-backed editable copy + section toggles for the campaign
 * pages, edited from the marketing hub (/admin/content), applied LIVE (no deploy).
 *
 * Architecture:
 *   - CONTENT_MANIFEST = single source of truth for what's editable per page
 *     (field keys + labels + DEFAULT copy + section toggles). Add a page here +
 *     wire its render fn with pc()/sec() and it shows up in the editor automatically.
 *   - lead_page_content table holds overrides (page, ckey, val). Empty = use default.
 *   - pc(content,page,key) = override ?? manifest default.  sec(...) = toggle on/off.
 *   - Editor (GET /admin/content) + save (POST /admin/content/save), marketing+admin gated.
 */
import type { Application } from 'express';
import type { Pool } from 'pg';
import { canManageQR } from '../lib/permissions.js';

export type ContentMap = Record<string, Record<string, string>>;

type Field = { key: string; label: string; def: string; type?: 'text' | 'textarea' };
type Toggle = { key: string; label: string; on: boolean };
type PageDef = { title: string; path: string; fields: Field[]; toggles?: Toggle[] };

// Add pages here as they're wired with pc()/sec(). Defaults must match the page's
// original copy so nothing visually changes until someone edits.
export const CONTENT_MANIFEST: Record<string, PageDef> = {
  'free-inspection': {
    title: 'Free Inspection', path: '/free-inspection',
    fields: [
      { key: 'hero_eyebrow', label: 'Hero eyebrow (small label above headline)', def: '100% Free • No Obligation' },
      { key: 'hero_h1', label: 'Headline  (wrap a word in *asterisks* to color it red)', def: 'Get Your *Free Roof Inspection* Today' },
      { key: 'hero_sub', label: 'Subheadline', type: 'textarea', def: 'Licensed, insured, and trusted across VA, MD & PA. We climb up, document everything with photos, and give you an honest, no-pressure assessment — at zero cost.' },
      { key: 'hero_cta', label: 'Main button text', def: 'Book My Free Inspection' },
    ],
    toggles: [
      { key: 'show_stats', label: 'Show the stats band (8,000+ projects · 8 years · top 2%)', on: true },
    ],
  },
  'claim-help': {
    title: 'Claim Help Quiz', path: '/claim-help',
    fields: [
      { key: 'hero_eyebrow', label: 'Hero eyebrow (small label above headline)', def: 'Free Insurance Assessment' },
      { key: 'hero_h1', label: 'Headline  (wrap a word in *asterisks* to color it red)', def: 'Is Your Roof Damage *Covered?*' },
      { key: 'hero_sub', label: 'Subheadline', type: 'textarea', def: 'Answer 4 quick questions and find out in under 60 seconds. No cost, no obligation — just a straight answer from licensed local pros.' },
    ],
    toggles: [
      { key: 'show_trust', label: 'Show the reassurance ribbon (8,000+ roofs · 8 years · GAF President’s Club · BBB A+)', on: true },
    ],
  },
  'storm': {
    title: 'Storm Damage', path: '/storm/22182',
    fields: [
      { key: 'hero_eyebrow', label: 'Hero eyebrow (small label above headline)', def: 'Free Roof Check • VA · MD · PA' },
      { key: 'hero_cta', label: 'Main button text', def: 'Check My Roof — Free' },
    ],
    toggles: [
      { key: 'show_stats', label: 'Show the stats band (8,000+ roofs · 8 years · top 2%)', on: true },
    ],
  },
  'storm-checklist': {
    title: 'Storm Checklist (Lead Magnet)', path: '/storm-checklist',
    fields: [
      { key: 'hero_eyebrow', label: 'Hero eyebrow (small label above headline)', def: 'Free Homeowner Download' },
      { key: 'hero_h1', label: 'Headline  (wrap a word in *asterisks* to color it red)', def: 'Your Storm Damage *Insurance* Claim Checklist' },
      { key: 'hero_sub', label: 'Subheadline', type: 'textarea', def: 'The step-by-step guide VA, MD & PA homeowners use to document damage, beat the deadlines, and get every dollar their policy owes them.' },
      { key: 'hero_cta', label: 'Checklist button text (the email-gate submit button)', def: 'Send Me the Checklist' },
    ],
    toggles: [
      { key: 'show_testimonials', label: 'Show the homeowner testimonial quotes (Sarah M. + James T.)', on: true },
    ],
  },
  'refer': {
    title: 'Referral Landing', path: '/refer/demo',
    fields: [
      { key: 'hero_eyebrow', label: 'Hero eyebrow — shown to cold visitors (no referrer). Visitors arriving from a rep\'s referral link always see "A Personal Referral" instead.', def: 'Free Inspection' },
      { key: 'hero_cta', label: 'Main button text', def: 'Request Free Inspection' },
    ],
    toggles: [
      { key: 'show_stats', label: 'Show the proof-stats row (8,000+ roofs · 8 yrs · Top 2% · A+)', on: true },
    ],
  },
  'roofcheck': {
    title: 'RoofCheck (storm self-check)', path: '/roofcheck',
    fields: [
      { key: 'hero_eyebrow', label: 'Hero eyebrow (small label above headline)', def: 'Free 10-second storm check' },
      { key: 'hero_h1', label: 'Headline  (wrap a word in *asterisks* to color it red)', def: 'Did the storm hit *your roof?*' },
      { key: 'hero_sub', label: 'Subheadline', type: 'textarea', def: "Enter your address and we'll pull your address-level hail history and tell you whether your roof qualifies for an insurance inspection — in seconds." },
      { key: 'hero_cta', label: 'Main button text (the address-check button)', def: 'Check my roof' },
    ],
    toggles: [
      { key: 'show_trust', label: 'Show the trust band (8,000+ projects · handles insurance · licensed & local)', on: true },
    ],
  },
};

let _cache: ContentMap | null = null;
let _cacheAt = 0;

export async function ensureContentTable(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS lead_page_content (
    page TEXT NOT NULL, ckey TEXT NOT NULL, val TEXT,
    updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (page, ckey)
  )`);
}

export async function loadContent(pool: Pool): Promise<ContentMap> {
  if (_cache && Date.now() - _cacheAt < 10000) return _cache;
  const map: ContentMap = {};
  try {
    const r = await pool.query(`SELECT page, ckey, val FROM lead_page_content`);
    for (const row of r.rows) { (map[row.page] ||= {})[row.ckey] = row.val; }
  } catch { /* table may not exist yet — fall back to defaults */ }
  _cache = map; _cacheAt = Date.now();
  return map;
}
export function bustContentCache() { _cache = null; _cacheAt = 0; }

/** Editable value: DB override → manifest default. */
export function pc(content: ContentMap, page: string, key: string): string {
  const v = content?.[page]?.[key];
  if (v != null && v !== '') return v;
  return CONTENT_MANIFEST[page]?.fields.find((f) => f.key === key)?.def ?? '';
}
/** Section toggle: DB override → manifest default. */
export function sec(content: ContentMap, page: string, key: string): boolean {
  const v = content?.[page]?.[key];
  if (v === '0' || v === 'off' || v === 'false') return false;
  if (v === '1' || v === 'on' || v === 'true') return true;
  const t = CONTENT_MANIFEST[page]?.toggles?.find((x) => x.key === key);
  return t ? t.on : true;
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);

/** Escape, then turn *phrase* into <em>phrase</em> — lets marketing color the red word safely (no raw HTML). */
export function markEm(text: string): string {
  return esc(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function registerLeadContent(app: Application, pool: Pool): void {
  ensureContentTable(pool).catch((e) => console.error('[content] ensure table:', e));

  app.get('/admin/content', async (req, res, next) => {
    try {
      const email = String(req.query.email || req.header('x-user-email') || '').trim();
      if (!email) return res.status(401).send('<h1>401</h1><p>Pass ?email=&lt;your email&gt; to edit content.</p>');
      if (!(await canManageQR(pool, email))) return res.status(403).send(`<h1>403</h1><p>${esc(email)} — marketing or admin only.</p>`);
      const content = await loadContent(pool);
      res.set('Content-Type', 'text/html'); res.set('Cache-Control', 'private, no-store');
      res.send(renderContentEditor(content, email));
    } catch (err) { next(err); }
  });

  app.post('/admin/content/save', async (req, res) => {
    try {
      const email = String(req.body?.email || req.header('x-user-email') || '').trim();
      if (!email || !(await canManageQR(pool, email))) return res.status(403).json({ ok: false, error: 'not authorized' });
      const page = String(req.body?.page || '');
      const def = CONTENT_MANIFEST[page];
      if (!def) return res.status(400).json({ ok: false, error: 'unknown page' });
      const fields = req.body?.fields || {}; const toggles = req.body?.toggles || {};
      const upsert = (ckey: string, val: string) => pool.query(
        `INSERT INTO lead_page_content (page, ckey, val, updated_by, updated_at) VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (page, ckey) DO UPDATE SET val=$3, updated_by=$4, updated_at=now()`,
        [page, ckey, val, email]);
      for (const f of def.fields) await upsert(f.key, String(fields[f.key] ?? ''));
      for (const t of def.toggles || []) await upsert(t.key, toggles[t.key] ? '1' : '0');
      bustContentCache();
      res.json({ ok: true });
    } catch (err) { console.error('[content] save:', err); res.status(500).json({ ok: false, error: 'save failed' }); }
  });
}

function renderContentEditor(content: ContentMap, email: string): string {
  const LEAD = 'https://get.theroofdocs.com';
  const pages = Object.entries(CONTENT_MANIFEST).map(([page, def]) => {
    const fields = def.fields.map((f) => {
      const cur = content?.[page]?.[f.key] ?? f.def;
      const input = f.type === 'textarea'
        ? `<textarea data-k="${esc(f.key)}" rows="3">${esc(cur)}</textarea>`
        : `<input data-k="${esc(f.key)}" value="${esc(cur)}">`;
      return `<label class="fld"><span>${esc(f.label)}</span>${input}</label>`;
    }).join('');
    const toggles = (def.toggles || []).map((t) => {
      const on = sec(content, page, t.key);
      return `<label class="tgl"><input type="checkbox" data-t="${esc(t.key)}" ${on ? 'checked' : ''}><span>${esc(t.label)}</span></label>`;
    }).join('');
    return `<section class="page" data-page="${esc(page)}">
      <div class="ph"><h2>${esc(def.title)}</h2><a class="prev" href="${LEAD}${esc(def.path)}" target="_blank" rel="noopener">Preview ↗</a></div>
      <div class="flds">${fields}</div>
      ${toggles ? `<div class="tgls">${toggles}</div>` : ''}
      <div class="actions"><button class="save" type="button">Save changes</button><span class="status"></span></div>
    </section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Content Studio — Roof-ER Marketing</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#fff;padding:24px;max-width:820px;margin:0 auto}
    h1{font-size:22px;font-weight:800} .sub{color:#9ca3af;font-size:13px;margin:4px 0 22px}
    .page{background:#141414;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px 20px;margin-bottom:16px}
    .ph{display:flex;align-items:center;gap:12px;margin-bottom:14px} .ph h2{font-size:16px} .prev{margin-left:auto;font-size:12px;color:#B70808;text-decoration:none}
    .fld{display:block;margin-bottom:12px} .fld span{display:block;font-size:12px;color:#d1d5db;margin-bottom:5px}
    .fld input,.fld textarea{width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#fff;font:inherit;font-size:14px;padding:9px 11px;resize:vertical}
    .fld input:focus,.fld textarea:focus{outline:none;border-color:#B70808}
    .tgls{border-top:1px solid rgba(255,255,255,.08);padding-top:12px;margin-top:4px} .tgl{display:flex;align-items:center;gap:9px;font-size:13px;color:#d1d5db;margin-bottom:8px} .tgl input{width:16px;height:16px;accent-color:#B70808}
    .actions{display:flex;align-items:center;gap:12px;margin-top:14px} .save{background:#B70808;border:none;color:#fff;border-radius:8px;padding:10px 20px;font-weight:700;font-size:13px;cursor:pointer} .save:disabled{opacity:.6} .status{font-size:12px;color:#22c55e}
  </style></head><body>
  <h1>Content Studio</h1>
  <div class="sub">Edit the live campaign-page copy &amp; sections — changes apply instantly, no deploy. Marketing &amp; admin only · ${esc(email)}</div>
  ${pages}
  <script>
  var EMAIL=${JSON.stringify(email)};
  document.querySelectorAll('.page').forEach(function(sec){
    var btn=sec.querySelector('.save'), st=sec.querySelector('.status');
    btn.addEventListener('click', async function(){
      var page=sec.getAttribute('data-page'), fields={}, toggles={};
      sec.querySelectorAll('[data-k]').forEach(function(el){ fields[el.getAttribute('data-k')]=el.value; });
      sec.querySelectorAll('[data-t]').forEach(function(el){ toggles[el.getAttribute('data-t')]=el.checked; });
      btn.disabled=true; st.textContent='Saving…'; st.style.color='#9ca3af';
      try{
        var r=await fetch('/admin/content/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:EMAIL,page:page,fields:fields,toggles:toggles})});
        var d=await r.json();
        if(d.ok){ st.textContent='Saved ✓ — live now'; st.style.color='#22c55e'; } else { st.textContent=d.error||'Failed'; st.style.color='#ef4444'; }
      }catch(e){ st.textContent='Network error'; st.style.color='#ef4444'; }
      btn.disabled=false; setTimeout(function(){ st.textContent=''; },4000);
    });
  });
  </script>
  </body></html>`;
}
