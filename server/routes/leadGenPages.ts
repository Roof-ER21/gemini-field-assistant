/**
 * Lead Generation Landing Pages — Server-Rendered HTML
 *
 * Five public routes for The Roof Docs:
 *   GET /storm/:zip        — Storm damage targeted landing page
 *   GET /claim-help        — Multi-step insurance claim quiz funnel
 *   GET /refer/:code       — Referral landing page from rep codes
 *   GET /free-inspection   — General free roof inspection landing page
 *   GET /storm-checklist   — Lead magnet: Storm Damage Claim Checklist (email-gated)
 *
 * All pages are mobile-first, fully inline-CSS, zero external JS deps,
 * and POST leads to /api/leads/intake on submit.
 */

import type { Application } from 'express';
import type { Pool } from 'pg';
import path from 'node:path';
import { existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Shared design tokens
// ---------------------------------------------------------------------------

const BRAND = {
  red: '#B70808',
  redHover: '#9a0706',
  redLight: 'rgba(182,8,7,0.12)',
  darkBlue: '#082c4b',
  bg: '#0a0a0a',
  card: '#1a1a1a',
  border: 'rgba(255,255,255,0.07)',
  textMuted: '#9ca3af',
  textDim: '#6b7280',
  green: '#22c55e',
  logo: 'https://www.theroofdocs.com/wp-content/uploads/2025/03/Main_Logo-1.png',
  logoFooter: 'https://www.theroofdocs.com/wp-content/uploads/2025/03/logo_footer_alt.0cc2e436.png',
  phone: '(571) 520-8507',
  email: 'marketing@theroofdocs.com',
  address: '8100 Boone Blvd, Suite 400, Vienna, VA 22182',
  vaLicense: '2705194709',
  mdLicense: '164697',
  paLicense: '145926',
  facebook: 'https://www.facebook.com/theroofdocs/',
  instagram: 'https://www.instagram.com/theroofdocs',
  // Certification badges from theroofdocs.com
  badgeGafElite: 'https://www.theroofdocs.com/wp-content/uploads/2025/03/Master_Elite-1024x1024.png',
  badgeBbb: 'https://www.theroofdocs.com/wp-content/uploads/2025/03/bbb-a-plus.webp',
  badgeSolar: 'https://www.theroofdocs.com/wp-content/uploads/2025/03/Certified-Solar-Installer_RGB-1-1-1024x1024.png',
  badgeBestPros: 'https://www.theroofdocs.com/wp-content/uploads/2025/03/Roof-ER-Logo-Alt-Colors-4.png',
};

// Rep-less default contact = the roofcheck / brand-video identity (NOT the (571) Susan
// campaign-text line, which stays on the Susan chat widget where it belongs).
const ROOFCHECK_PHONE = '(703) 239-3738';
const ROOFCHECK_SITE = 'theroofdocs.com';

// ---------------------------------------------------------------------------
// Rep-aware context — one identity follows the visitor (no per-page QR for reps)
// ?rep=<slug> is persisted in a cookie so a rep's single link carries attribution
// across every campaign page. Falls back to the roofcheck contact when unknown.
// (Helpers consumed by the per-page renderers; see repBoot + navBar(rep.phone).)
// ---------------------------------------------------------------------------

export type RepCtx = { slug: string; name: string; title: string; phone: string; image: string; isRep: boolean };

const NO_REP: RepCtx = { slug: '', name: '', title: '', phone: ROOFCHECK_PHONE, image: '', isRep: false };

function getCookie(header: string | undefined, key: string): string {
  if (!header) return '';
  const m = header.match(new RegExp('(?:^|; )' + key + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

async function resolveRep(pool: Pool, slug: string): Promise<RepCtx | null> {
  const safe = slug.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  if (!safe) return null;
  try {
    const r = await pool.query(
      `SELECT slug, name, phone_number AS phone, image_url AS image, title
         FROM employee_profiles WHERE slug = $1 LIMIT 1`,
      [safe]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      slug: row.slug, name: row.name || '', title: row.title || 'Your Roof-ER Specialist',
      phone: row.phone || ROOFCHECK_PHONE, image: row.image || '', isRep: true,
    };
  } catch (err) {
    console.error('[leadGenPages] resolveRep failed:', err);
    return null;
  }
}

/** Resolve the rep from ?rep=<slug> (or the persisted `ler` cookie); persist on first hit. */
async function repContext(req: any, res: any, pool: Pool): Promise<RepCtx> {
  const qslug = String(req.query?.rep || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const slug = qslug || getCookie(req.headers?.cookie, 'ler');
  const rep = slug ? await resolveRep(pool, slug) : null;
  if (rep && qslug) {
    try { res.cookie('ler', rep.slug, { maxAge: 30 * 864e5, sameSite: 'lax', httpOnly: false }); } catch { /* noop */ }
  }
  return rep || NO_REP;
}

/** Seeds window.__rep so every form on the page attributes the lead to the right rep. */
function repBoot(rep: RepCtx): string {
  return `<script>window.__rep=${JSON.stringify({ slug: rep.slug, name: rep.name, phone: rep.phone })};</script>`;
}

// ---------------------------------------------------------------------------
// Floating Chat Widget (Susan AI)
// ---------------------------------------------------------------------------

/**
 * Returns HTML/CSS/JS for a floating chat bubble on landing pages.
 * Uses the /api/susan/chat endpoint for Gemini-powered responses.
 * Insert before </body> in any landing page template.
 */
function renderChatWidget(): string {
  return `
<style>
  .chat-fab{position:fixed;bottom:20px;right:20px;width:56px;height:56px;
    border-radius:50%;background:${BRAND.red};border:none;cursor:pointer;
    box-shadow:0 4px 16px rgba(0,0,0,0.4);z-index:9999;display:flex;
    align-items:center;justify-content:center;transition:transform 0.2s}
  .chat-fab:hover{transform:scale(1.1)}
  .chat-fab svg{width:28px;height:28px;fill:#fff}
  .chat-panel{position:fixed;bottom:84px;right:20px;width:340px;max-height:440px;
    background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;
    z-index:9999;display:none;flex-direction:column;overflow:hidden;
    box-shadow:0 8px 32px rgba(0,0,0,0.5)}
  .chat-panel.open{display:flex}
  .chat-header{padding:14px 16px;background:${BRAND.darkBlue};
    border-bottom:1px solid ${BRAND.border};display:flex;align-items:center;gap:10px}
  .chat-header .dot{width:8px;height:8px;border-radius:50%;background:${BRAND.green}}
  .chat-header span{font-size:14px;font-weight:600;color:#fff}
  .chat-header .close-btn{margin-left:auto;background:none;border:none;
    color:${BRAND.textMuted};cursor:pointer;font-size:18px}
  .chat-messages{flex:1;overflow-y:auto;padding:12px;min-height:200px;max-height:300px}
  .chat-msg{margin-bottom:10px;max-width:85%;padding:10px 14px;border-radius:12px;
    font-size:13px;line-height:1.5}
  .chat-msg.bot{background:rgba(255,255,255,0.06);margin-right:auto;color:${BRAND.textMuted}}
  .chat-msg.user{background:${BRAND.red};margin-left:auto;color:#fff;text-align:right}
  .chat-input-row{display:flex;padding:10px;border-top:1px solid ${BRAND.border};gap:8px}
  .chat-input-row input{flex:1;padding:10px 14px;border-radius:10px;border:1px solid ${BRAND.border};
    background:rgba(0,0,0,0.3);color:#fff;font-size:14px;outline:none}
  .chat-input-row input::placeholder{color:${BRAND.textDim}}
  .chat-input-row button{padding:10px 14px;border:none;border-radius:10px;
    background:${BRAND.red};color:#fff;font-weight:600;cursor:pointer;font-size:14px}
  @media(max-width:400px){.chat-panel{width:calc(100vw - 32px);right:16px;bottom:80px}}
</style>

<button class="chat-fab" onclick="toggleChat()" aria-label="Chat with us">
  <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
</button>

<div class="chat-panel" id="chatPanel">
  <div class="chat-header">
    <div class="dot"></div>
    <span>Susan AI — Roofing Expert</span>
    <button class="close-btn" onclick="toggleChat()">&times;</button>
  </div>
  <div class="chat-messages" id="chatMessages">
    <div class="chat-msg bot">Hi! I'm Susan, your AI roofing assistant. Ask me anything about roof damage, insurance claims, or scheduling an inspection.</div>
  </div>
  <div class="chat-input-row">
    <input id="chatInput" placeholder="Ask a question..." onkeydown="if(event.key==='Enter')sendChat()">
    <button onclick="sendChat()">Send</button>
  </div>
</div>

<script>
function toggleChat(){
  document.getElementById('chatPanel').classList.toggle('open');
  if(document.getElementById('chatPanel').classList.contains('open')){
    document.getElementById('chatInput').focus();
  }
}
function sendChat(){
  var input=document.getElementById('chatInput');
  var msg=input.value.trim();
  if(!msg)return;
  input.value='';
  var msgs=document.getElementById('chatMessages');
  msgs.innerHTML+='<div class="chat-msg user">'+msg.replace(/</g,'&lt;')+'</div>';
  msgs.scrollTop=msgs.scrollHeight;
  msgs.innerHTML+='<div class="chat-msg bot" id="typing">Thinking...</div>';
  msgs.scrollTop=msgs.scrollHeight;
  fetch('/api/susan/chat',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message:msg})})
  .then(function(r){return r.json()})
  .then(function(d){
    var el=document.getElementById('typing');
    if(el)el.remove();
    var reply=d.success?d.response:'Sorry, I\\'m having trouble right now. Call us at ${BRAND.phone}!';
    msgs.innerHTML+='<div class="chat-msg bot">'+reply.replace(/</g,'&lt;').replace(/\\n/g,'<br>')+'</div>';
    msgs.scrollTop=msgs.scrollHeight;
  })
  .catch(function(){
    var el=document.getElementById('typing');
    if(el)el.remove();
    msgs.innerHTML+='<div class="chat-msg bot">Oops, connection issue. Call us at ${BRAND.phone}!</div>';
    msgs.scrollTop=msgs.scrollHeight;
  });
}
</script>`;
}

// ---------------------------------------------------------------------------
// Shared HTML partials
// ---------------------------------------------------------------------------

function htmlHead(title: string, description: string, canonical?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  ${canonical ? `<link rel="canonical" href="${escHtml(canonical)}">` : ''}
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:type" content="website">
  <meta name="robots" content="index, follow">
  <link rel="icon" type="image/png" href="${BRAND.logo}">
  <meta property="og:image" content="${BRAND.logo}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  ${sharedCss()}
</head>
<body>`;
}

function sharedCss(): string {
  return `<style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${BRAND.bg};color:#fff;line-height:1.6;-webkit-font-smoothing:antialiased}
    a{color:inherit;text-decoration:none}
    img{max-width:100%;height:auto;display:block}
    button{cursor:pointer;font-family:inherit;border:none;outline:none}

    /* ── Layout ── */
    .container{max-width:640px;margin:0 auto;padding:0 20px}
    .container-wide{max-width:960px;margin:0 auto;padding:0 20px}

    /* ── Navbar ── */
    .nav{background:#111;border-bottom:1px solid ${BRAND.border};padding:14px 0;position:sticky;top:0;z-index:100;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
    .nav-inner{display:flex;align-items:center;justify-content:space-between;max-width:960px;margin:0 auto;padding:0 20px}
    .nav-brand{display:flex;align-items:center;gap:10px}
    .nav-brand img{height:52px;width:auto}
    .nav-brand-name{font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.01em}
    .nav-call{background:${BRAND.red};color:#fff;font-size:13px;font-weight:700;padding:9px 20px;border-radius:6px;transition:background 0.2s;white-space:nowrap}
    .nav-call:hover{background:${BRAND.redHover}}

    /* ── Urgency Banner ── */
    .urgency-banner{background:${BRAND.red};color:#fff;text-align:center;padding:11px 20px;font-size:14px;font-weight:600;letter-spacing:0.01em}
    .urgency-banner span{opacity:0.85;font-weight:400}

    /* ── Hero ── */
    .hero{padding:52px 0 44px;text-align:center}
    .hero-eyebrow{display:inline-block;background:${BRAND.redLight};color:${BRAND.red};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:5px 14px;border-radius:20px;margin-bottom:20px;border:1px solid rgba(182,8,7,0.25)}
    .hero-title{font-family:'Anton','Inter',sans-serif;font-weight:400;font-size:clamp(34px,6.5vw,58px);line-height:1.0;letter-spacing:0.3px;margin-bottom:16px}
    .hero-title em{color:${BRAND.red};font-style:normal}
    .hero-sub{font-size:clamp(15px,2.5vw,18px);color:${BRAND.textMuted};max-width:480px;margin:0 auto 32px}

    /* ── Card / Form ── */
    .card{background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;padding:32px 28px;margin-bottom:24px}
    @media(max-width:480px){.card{padding:24px 18px}}
    .card-title{font-size:18px;font-weight:700;margin-bottom:6px}
    .card-subtitle{font-size:13px;color:${BRAND.textMuted};margin-bottom:22px}

    /* ── Form Elements ── */
    .form-group{margin-bottom:16px}
    .form-label{display:block;font-size:13px;font-weight:600;color:#d1d5db;margin-bottom:6px}
    .form-label .req{color:${BRAND.red}}
    .form-control{width:100%;background:#111;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-family:inherit;font-size:15px;padding:12px 14px;transition:border-color 0.2s,box-shadow 0.2s;-webkit-appearance:none;appearance:none}
    .form-control::placeholder{color:#4b5563}
    .form-control:focus{outline:none;border-color:${BRAND.red};box-shadow:0 0 0 3px rgba(182,8,7,0.18)}
    textarea.form-control{resize:vertical;min-height:90px}
    select.form-control{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%236b7280' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:40px}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:480px){.form-row{grid-template-columns:1fr}}

    /* ── Submit Button ── */
    .btn-submit{display:block;width:100%;background:${BRAND.red};color:#fff;font-size:16px;font-weight:700;padding:15px 24px;border-radius:9px;text-align:center;transition:background 0.2s,transform 0.1s;margin-top:8px;letter-spacing:0.01em}
    .btn-submit:hover:not(:disabled){background:${BRAND.redHover}}
    .btn-submit:active:not(:disabled){transform:scale(0.99)}
    .btn-submit:disabled{opacity:0.6;cursor:not-allowed}
    .form-note{font-size:12px;color:${BRAND.textDim};text-align:center;margin-top:10px}

    /* ── Trust Badges ── */
    .badges{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;align-items:center;margin:36px 0;padding:24px 0}
    .badge{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border:1px solid ${BRAND.border};border-radius:12px;padding:12px 16px}
    .badge img{height:72px;width:auto;object-fit:contain}
    @media(max-width:600px){.badge img{height:56px}}

    /* ── FAQ ── */
    .faq-section{padding:40px 0}
    .faq-title{font-size:20px;font-weight:700;text-align:center;margin-bottom:24px}
    .faq-item{background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;margin-bottom:10px;overflow:hidden}
    .faq-q{width:100%;background:none;color:#fff;font-size:14px;font-weight:600;text-align:left;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;transition:background 0.15s}
    .faq-q:hover{background:rgba(255,255,255,0.04)}
    .faq-q[aria-expanded="true"] .faq-chevron{transform:rotate(180deg)}
    .faq-chevron{flex-shrink:0;transition:transform 0.25s;color:${BRAND.textDim}}
    .faq-a{font-size:13px;color:${BRAND.textMuted};padding:0 20px;max-height:0;overflow:hidden;transition:max-height 0.3s ease,padding 0.3s ease}
    .faq-item.open .faq-a{max-height:300px;padding:0 20px 16px}

    /* ── Footer ── */
    .footer{border-top:1px solid ${BRAND.border};padding:28px 0 56px;text-align:center;color:${BRAND.textDim};font-size:13px;position:relative}
    .ao-sig{position:absolute;left:18px;bottom:14px;display:flex;flex-direction:column;align-items:center;gap:1px;opacity:.85;pointer-events:none}
    .ao-sig img{display:block;height:24px;width:auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
    .ao-sig span{font-family:Georgia,'Times New Roman',serif;font-size:9.5px;letter-spacing:.04em;color:rgba(255,255,255,.5);margin-top:1px}
    @media(max-width:560px){.ao-sig{position:static;margin:16px auto 0;right:auto;bottom:auto}.footer{padding-bottom:28px}}
    .footer strong{color:${BRAND.textMuted}}
    .footer-areas{margin-top:6px;font-size:12px}

    /* ── Success State ── */
    .success-box{text-align:center;padding:48px 24px}
    .success-icon{font-size:48px;margin-bottom:16px}
    .success-title{font-size:22px;font-weight:700;color:${BRAND.green};margin-bottom:10px}
    .success-body{font-size:15px;color:${BRAND.textMuted}}

    /* ── Quiz (Claim Help) ── */
    .quiz-wrap{max-width:580px;margin:0 auto;padding:0 20px}
    .progress-bar-wrap{background:rgba(255,255,255,0.08);border-radius:99px;height:6px;margin-bottom:36px;overflow:hidden}
    .progress-bar-fill{background:${BRAND.red};height:100%;border-radius:99px;transition:width 0.4s cubic-bezier(.4,0,.2,1)}
    .step-counter{font-size:12px;font-weight:600;color:${BRAND.textDim};letter-spacing:0.08em;text-transform:uppercase;text-align:center;margin-bottom:10px}
    .quiz-step{display:none;animation:fadeUp 0.3s ease}
    .quiz-step.active{display:block}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .quiz-q{font-size:clamp(20px,4vw,28px);font-weight:800;text-align:center;margin-bottom:28px;letter-spacing:-0.01em;line-height:1.25}
    .radio-group{display:flex;flex-direction:column;gap:10px;max-width:420px;margin:0 auto 28px}
    .radio-opt{background:${BRAND.card};border:2px solid ${BRAND.border};border-radius:10px;padding:14px 18px;font-size:15px;font-weight:500;color:#d1d5db;cursor:pointer;transition:border-color 0.15s,background 0.15s,color 0.15s;text-align:left;width:100%}
    .radio-opt:hover{border-color:rgba(182,8,7,0.5);background:rgba(182,8,7,0.06);color:#fff}
    .radio-opt.selected{border-color:${BRAND.red};background:${BRAND.redLight};color:#fff}

    /* ── Rep Card (Referral) ── */
    .rep-card{display:flex;align-items:center;gap:20px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;padding:24px;margin-bottom:28px}
    .rep-avatar{width:80px;height:80px;border-radius:50%;object-fit:cover;flex-shrink:0;border:3px solid ${BRAND.red};background:#222}
    .rep-avatar-initials{width:80px;height:80px;border-radius:50%;background:${BRAND.red};display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#fff;flex-shrink:0}
    .rep-info{flex:1;min-width:0}
    .rep-name{font-size:20px;font-weight:700;margin-bottom:2px}
    .rep-title{font-size:13px;color:${BRAND.textMuted};margin-bottom:8px}
    .rep-phone{font-size:14px;font-weight:600;color:${BRAND.red}}
    @media(max-width:480px){.rep-card{flex-direction:column;text-align:center}}

    /* ── Bespoke uplift — ports the brand-video look (cinematic ink/red, Anton) ── */
    .hero{position:relative;overflow:hidden}
    .hero::before{content:'';position:absolute;inset:-1px;background:radial-gradient(ellipse 85% 65% at 50% -12%, rgba(183,8,8,0.18), transparent 70%);pointer-events:none}
    .hero>*{position:relative;z-index:1}
    .hero-eyebrow{box-shadow:0 0 0 1px rgba(183,8,8,0.28)}
    .btn-submit{background:linear-gradient(180deg,#d40a0a,${BRAND.red});box-shadow:0 10px 26px rgba(183,8,8,0.34)}
    .btn-submit:hover:not(:disabled){background:linear-gradient(180deg,#e21010,${BRAND.redHover})}
    .nav-call{box-shadow:0 4px 14px rgba(183,8,8,0.3)}
    /* rep strip — shown only when a rep's link is in play */
    .rep-strip{display:flex;align-items:center;gap:12px;justify-content:center;background:rgba(183,8,8,0.08);border:1px solid rgba(183,8,8,0.25);border-radius:99px;padding:8px 16px;max-width:max-content;margin:0 auto 22px;font-size:13px;font-weight:600}
    .rep-strip img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid ${BRAND.red}}
    .rep-strip-dot{width:8px;height:8px;border-radius:50%;background:${BRAND.green}}
  </style>`;
}

/** Inline form-submit script, parametrised by button label */
function formScript(buttonLabel: string = 'Get Free Inspection'): string {
  const escaped = escHtml(buttonLabel);
  return `<script>
(function(){
  var form = document.getElementById('lead-form');
  if(!form) return;
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Submitting\u2026';
    var data = Object.fromEntries(new FormData(form));
    try{
      var res = await fetch('/api/leads/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      var result = await res.json();
      if(result.success){
        form.innerHTML = '<div class="success-box"><div class="success-icon">&#10003;</div><h2 class="success-title">You&#39;re All Set!</h2><p class="success-body">We&#39;ll contact you within 1 hour to schedule your free inspection.</p></div>';
      } else {
        alert(result.error || 'Submission failed. Please try again.');
        btn.disabled = false;
        btn.textContent = '${escaped}';
      }
    } catch(err){
      alert('Network error. Please try again.');
      btn.disabled = false;
      btn.textContent = '${escaped}';
    }
  });
})();
</script>`;
}

function faqScript(): string {
  return `<script>
(function(){
  document.querySelectorAll('.faq-q').forEach(function(btn){
    btn.addEventListener('click',function(){
      var item = btn.closest('.faq-item');
      var open = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function(i){i.classList.remove('open');i.querySelector('.faq-q').setAttribute('aria-expanded','false')});
      if(!open){item.classList.add('open');btn.setAttribute('aria-expanded','true');}
    });
  });
})();
</script>`;
}

function navBar(phoneNumber: string = ROOFCHECK_PHONE): string {
  const tel = phoneNumber.replace(/\D/g, '');
  return `<nav class="nav" role="navigation" aria-label="Main navigation">
  <div class="nav-inner">
    <a href="https://theroofdocs.com" class="nav-brand" aria-label="The Roof Docs home" target="_blank" rel="noopener">
      <img src="${BRAND.logoFooter}" alt="The Roof Docs" style="height:56px;width:auto">
    </a>
    <a href="tel:+1${tel}" class="nav-call" aria-label="Call us now">&#9742; ${escHtml(phoneNumber)}</a>
  </div>
</nav>`;
}

function trustBadges(): string {
  const badges = [
    [BRAND.badgeGafElite, 'GAF Master Elite Residential Roofing Contractor', ''],
    [BRAND.badgeBbb, 'BBB Accredited Business A+ Rating', ''],
    [BRAND.badgeSolar, 'GAF Energy Solar Certified Installer', ''],
    [BRAND.badgeBestPros, 'Best Pros in Town - Roofing Contractor Recommends', `background:${BRAND.red};`],
  ];
  return `<div class="badges" role="list" aria-label="Trust credentials">
  ${badges.map(([src, alt, extra]) => `<div class="badge" role="listitem" style="${extra}"><img src="${src}" alt="${alt}" loading="lazy"></div>`).join('\n  ')}
</div>`;
}

function footer(): string {
  return `<footer class="footer">
  <div class="container-wide">
    <div style="margin-bottom:12px">
      <img src="${BRAND.logoFooter}" alt="The Roof Docs" height="32" style="height:32px;width:auto;margin:0 auto 10px;display:block;opacity:0.85">
    </div>
    <div style="margin-bottom:8px">
      <strong>Integrity. Quality. Simplicity.</strong>
    </div>
    <div style="margin-bottom:6px;font-size:12px">
      ${escHtml(BRAND.address)} &bull; <a href="tel:+1${ROOFCHECK_PHONE.replace(/\D/g, '')}" style="color:${BRAND.red}">${escHtml(ROOFCHECK_PHONE)}</a>
    </div>
    <div style="margin-bottom:8px;font-size:12px">
      VA #${BRAND.vaLicense} &bull; MD MHIC #${BRAND.mdLicense} &bull; PA #${BRAND.paLicense}
    </div>
    <div style="margin-bottom:10px">
      <a href="${BRAND.facebook}" target="_blank" rel="noopener" style="color:${BRAND.textMuted};margin:0 8px;font-size:14px">Facebook</a>
      &bull;
      <a href="${BRAND.instagram}" target="_blank" rel="noopener" style="color:${BRAND.textMuted};margin:0 8px;font-size:14px">Instagram</a>
    </div>
    <div class="footer-areas">Serving Virginia &bull; Maryland &bull; Pennsylvania</div>
    <div style="margin-top:8px;font-size:11px;color:#4b5563">&copy; ${new Date().getFullYear()} The Roof Docs. All rights reserved.</div>
  </div>
  <div class="ao-sig" aria-label="Susan 21 · AO21"><img src="/brand/ao21-sig.png" alt="" width="34" height="24" loading="lazy"><span>Susan&nbsp;21</span></div>
</footer>`;
}

/** Minimal HTML entity escape for user-derived strings inserted into HTML */
function escHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Page 1: Storm Landing — /storm/:zip
// ---------------------------------------------------------------------------

function renderStormPage(storm: Record<string, any> | null, zip: string, rep: RepCtx): string {
  const hasStorm = !!storm;
  const city: string = storm?.city || '';
  const state: string = storm?.state || '';
  const eventType: string = storm?.event_type || 'Storm';
  const hailSize: string = storm?.hail_size_inches ? `${storm.hail_size_inches}"` : '';
  const eventDate: string = storm?.event_date
    ? new Date(storm.event_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
    : '';

  // Headline focal location: the storm's city/state when known, else the visitor's ZIP.
  const place = hasStorm ? `${city}${state ? `, ${state}` : ''}` : zip;

  const seoTitle = hasStorm
    ? `Storm Damage Roof Repair in ${city} ${state} | Free Inspection | The Roof Docs`
    : `Free Roof Inspection in ${zip} | Storm Damage Experts | The Roof Docs`;
  const seoDesc = hasStorm
    ? `${eventType} damage reported in ${city}, ${state}. Get a free roof inspection from The Roof Docs — licensed, insured, insurance-claim experts. 8,000+ roofs over 8 years.`
    : `Schedule your free roof inspection in ${zip}. The Roof Docs serve VA, MD & PA — licensed, insured storm-damage experts. 8,000+ roofs over 8 years.`;

  // Urgency banner — storm-aware, ink/red brand voice.
  const urgencyText = hasStorm
    ? `&#9888;&nbsp; Storm activity confirmed near <b>${escHtml(place)}</b> &mdash; free roof checks open now`
    : `&#9888;&nbsp; Free roof checks open now for <b>${escHtml(zip)}</b>`;

  // Anton hero headline — exactly ONE word wrapped in <em> (CSS renders <em> red).
  // hasStorm  -> "Did Your Roof Get <em>Hit</em>?"  (the storm/hail urgency question)
  // !hasStorm -> "Is Your Roof <em>Okay</em>?"       (same did-you-get-hit intent, no storm row yet)
  const heroTitle = hasStorm
    ? `Did Your Roof Get <em>Hit</em>?`
    : `Is Your Roof <em>Okay</em>?`;

  const heroSub = hasStorm
    ? `${hailSize ? `Hail up to ${escHtml(hailSize)} was reported` : `Damage was reported`}${eventDate ? ` on ${eventDate}` : ''} around ${escHtml(place)}. Most homeowners qualify for a <strong>fully covered repair</strong> through insurance &mdash; but only if the damage is documented in time.`
    : `Storms move fast and damage hides. Our team checks roofs across ${escHtml(zip)} and all of VA, MD &amp; PA &mdash; <strong>free, no obligation</strong> &mdash; then handles the insurance claim end to end.`;

  const faqs = [
    {
      q: 'How do I know if my roof was actually hit?',
      a: 'Hail and wind damage is often invisible from the ground — bruised or fractured shingles, lost granules, dented flashing and vents. Our inspectors get on the roof and document every impact with photos, so you know for certain instead of guessing.',
    },
    {
      q: 'Will my insurance cover the repair?',
      a: 'Most standard homeowner policies cover storm damage from hail, wind, and falling debris. What you pay typically comes down to your deductible. We meet your adjuster on the roof and make sure the full scope of damage is on the claim.',
    },
    {
      q: 'How long do I have to file a storm claim?',
      a: 'Most insurers require a claim within 1–3 years of the storm date, but waiting works against you: fresh damage is easier to prove, and a small leak today becomes uncovered interior damage later. The sooner we look, the stronger your claim.',
    },
    {
      q: 'Who are The Roof Docs?',
      a: 'A GAF Master Elite contractor — a rating held by only the top 2% of roofers in the country — with an A+ BBB rating and 8,000+ roofs completed over 8 years across Virginia, Maryland, and Pennsylvania. Licensed in all three states.',
    },
  ];

  // Slim rep strip — only when a rep's link is in play. One identity, no QR codes.
  const repStrip = rep.isRep
    ? `<div class="rep-strip" aria-label="Your assigned specialist">
        <span class="rep-strip-dot" aria-hidden="true"></span>
        ${rep.image ? `<img src="${escHtml(rep.image)}" alt="Photo of ${escHtml(rep.name)}" width="30" height="30" loading="eager">` : ''}
        <span>Your Roof-ER specialist: <b>${escHtml(rep.name)}</b></span>
      </div>`
    : '';

  return `${htmlHead(seoTitle, seoDesc)}
${repBoot(rep)}
${navBar(rep.phone)}

<style>
  /* ── Storm page bespoke layer — cinematic ink/red, ports the brand-video look ── */

  /* Animated urgency banner: a slow red sweep so it reads "live", not a static bar */
  .storm-urgency{position:relative;overflow:hidden;background:${BRAND.red};color:#fff;text-align:center;padding:11px 20px;font-size:14px;font-weight:600;letter-spacing:0.01em}
  .storm-urgency b{font-weight:800}
  .storm-urgency::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,0.22) 50%,transparent 80%);transform:translateX(-100%);animation:stormSweep 3.4s ease-in-out infinite}
  @keyframes stormSweep{0%{transform:translateX(-100%)}55%,100%{transform:translateX(100%)}}
  @media(prefers-reduced-motion:reduce){.storm-urgency::after{animation:none;display:none}}

  /* Hero stage — deepen the ink and layer a second storm-cloud glow behind the
     shared .hero::before red radial. PHOTO-SLOT lives here as a CSS background. */
  .storm-hero{position:relative;padding:64px 0 40px;background:
    radial-gradient(120% 90% at 50% 120%, rgba(183,8,8,0.10), transparent 60%),
    linear-gradient(180deg,#0c0c0c 0%, ${BRAND.bg} 70%)}
  /* PHOTO-SLOT: storm-hero-bg — drop a darkened IG/job storm-roof photo here as a
     background-image layer (kept commented so nothing 404s until a real asset lands):
     .storm-hero{background-image:url('/img/storm-roof.jpg');background-size:cover;background-position:center;}
     .storm-hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,10,0.55),rgba(10,10,10,0.92));z-index:0} */
  .storm-hero > .container{position:relative;z-index:2}
  .storm-hero .hero-title{font-size:clamp(40px,9vw,84px);line-height:0.94;letter-spacing:0.5px;text-shadow:0 2px 40px rgba(0,0,0,0.6)}
  .storm-zip-line{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-size:13px;font-weight:600;color:${BRAND.textMuted};letter-spacing:0.04em}
  .storm-zip-line .pin{color:${BRAND.red}}

  /* Storm "stat band" — confident, high-contrast proof row under the hero.
     Canon numbers only: 8,000+ roofs, 8 years, top 2% (GAF Master Elite). */
  .storm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:8px 0 4px}
  .storm-stat{background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015));border:1px solid ${BRAND.border};border-radius:14px;padding:20px 12px;text-align:center}
  .storm-stat .n{font-family:'Anton','Inter',sans-serif;font-weight:400;font-size:clamp(26px,6vw,40px);line-height:1;color:#fff;letter-spacing:0.5px}
  .storm-stat .n em{color:${BRAND.red};font-style:normal}
  .storm-stat .l{font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${BRAND.textMuted};margin-top:8px}
  @media(max-width:480px){.storm-stat{padding:16px 8px}.storm-stat .l{font-size:10px}}

  /* Damage-signals strip — quick "what hail does" visual rhythm, CSS-only motif.
     PHOTO-SLOT for each icon tile is left commented for real close-up shots. */
  .storm-signals{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:8px}
  .storm-signal{display:flex;gap:12px;align-items:flex-start;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;padding:16px}
  .storm-signal .ico{flex-shrink:0;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;background:${BRAND.redLight};border:1px solid rgba(182,8,7,0.28)}
  /* PHOTO-SLOT: damage-signal-thumbs — swap each .ico for a 40x40 cropped damage photo later */
  .storm-signal h3{font-size:14px;font-weight:700;margin-bottom:2px}
  .storm-signal p{font-size:12.5px;color:${BRAND.textMuted};line-height:1.5}
  @media(max-width:560px){.storm-signals{grid-template-columns:1fr}}

  .storm-section-h{font-family:'Anton','Inter',sans-serif;font-weight:400;font-size:clamp(24px,5vw,36px);line-height:1.05;letter-spacing:0.4px;text-align:center;margin-bottom:22px}
  .storm-section-h em{color:${BRAND.red};font-style:normal}
  .storm-form-hint{display:inline-block;background:${BRAND.redLight};border:1px solid rgba(182,8,7,0.28);color:#fff;font-size:12px;font-weight:700;letter-spacing:0.04em;padding:5px 12px;border-radius:20px;margin-bottom:14px}
</style>

<div class="storm-urgency" role="alert">${urgencyText}</div>

<main>
  <section class="hero storm-hero">
    <div class="container">
      <div class="hero-eyebrow">Free Roof Check &bull; VA &middot; MD &middot; PA</div>
      ${repStrip}
      <h1 class="hero-title">${heroTitle}</h1>
      <p class="hero-sub">${heroSub}</p>
      <div class="storm-zip-line"><span class="pin">&#9679;</span> ${hasStorm ? `Checking roofs around <b style="color:#fff;margin-left:2px">${escHtml(place)}</b>` : `Now serving ZIP <b style="color:#fff;margin-left:2px">${escHtml(zip)}</b>`}</div>
    </div>
  </section>

  <!-- Proof band — canon stats only (8,000+ roofs / 8 years / top 2%) -->
  <section aria-label="Why homeowners trust The Roof Docs">
    <div class="container">
      <div class="storm-stats">
        <div class="storm-stat"><div class="n"><em>8,000</em>+</div><div class="l">Roofs Completed</div></div>
        <div class="storm-stat"><div class="n"><em>8</em> yrs</div><div class="l">In VA &middot; MD &middot; PA</div></div>
        <div class="storm-stat"><div class="n">Top <em>2</em>%</div><div class="l">GAF Master Elite</div></div>
      </div>
    </div>
  </section>

  <section aria-label="Lead capture form">
    <div class="container">
      <div class="card">
        <div class="storm-form-hint">&#9201; 60-second request</div>
        <h2 class="card-title">See if your roof got hit &mdash; free, no obligation</h2>
        <p class="card-subtitle">One of our inspectors will contact you within 1 hour.</p>

        <form id="lead-form" novalidate aria-label="Inspection request form">
          <input type="hidden" name="source" value="storm">
          <input type="hidden" name="zip" value="${escHtml(zip)}">
          ${hasStorm ? `<input type="hidden" name="stormZoneId" value="${escHtml(String(storm?.id ?? ''))}">` : ''}
          ${hasStorm ? `<input type="hidden" name="eventType" value="${escHtml(eventType)}">` : ''}

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="name">Full Name <span class="req" aria-hidden="true">*</span></label>
              <input class="form-control" id="name" name="name" type="text" placeholder="Jane Smith" required autocomplete="name">
            </div>
            <div class="form-group">
              <label class="form-label" for="phone">Phone Number <span class="req" aria-hidden="true">*</span></label>
              <input class="form-control" id="phone" name="phone" type="tel" placeholder="(703) 239-3738" required autocomplete="tel">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email Address</label>
            <input class="form-control" id="email" name="email" type="email" placeholder="jane@example.com" autocomplete="email">
          </div>

          <div class="form-group">
            <label class="form-label" for="address">Property Address</label>
            <input class="form-control" id="address" name="address" type="text" placeholder="123 Main St, Springfield, VA 22150" autocomplete="street-address">
          </div>

          <div class="form-group">
            <label class="form-label" for="damage_description">What have you noticed? <span style="color:${BRAND.textDim};font-weight:400">(optional)</span></label>
            <textarea class="form-control" id="damage_description" name="damage_description" placeholder="e.g. Missing shingles on the south side, granules in the gutters, a new water stain in the attic…" rows="3"></textarea>
          </div>

          <button type="submit" class="btn-submit">Check My Roof &mdash; Free &rarr;</button>
          <p class="form-note">&#128274; Your information is private and will never be sold.</p>
        </form>
      </div>
    </div>
  </section>

  <!-- What hail/wind actually does — CSS-only signal tiles -->
  <section aria-label="Signs of storm damage" style="padding:8px 0 8px">
    <div class="container">
      <h2 class="storm-section-h">The damage you <em>can't</em> see from the ground</h2>
      <div class="storm-signals">
        <div class="storm-signal">
          <div class="ico" aria-hidden="true">&#129704;</div>
          <div><h3>Bruised &amp; fractured shingles</h3><p>Hail strikes weaken the mat under the surface long before a leak ever shows up inside.</p></div>
        </div>
        <div class="storm-signal">
          <div class="ico" aria-hidden="true">&#127786;</div>
          <div><h3>Lifted &amp; creased shingles</h3><p>High wind breaks the seal and creases shingles, so the next storm peels them right off.</p></div>
        </div>
        <div class="storm-signal">
          <div class="ico" aria-hidden="true">&#128167;</div>
          <div><h3>Granules in the gutters</h3><p>Piles of asphalt granules are the roof shedding its protective layer after an impact.</p></div>
        </div>
        <div class="storm-signal">
          <div class="ico" aria-hidden="true">&#128737;</div>
          <div><h3>Dented flashing &amp; vents</h3><p>Soft metal dents first — a clear tell for an adjuster that hail came through your area.</p></div>
        </div>
      </div>
    </div>
  </section>

  <section aria-label="Trust credentials">
    <div class="container-wide">
      ${trustBadges()}
    </div>
  </section>

  <section class="faq-section" aria-label="Frequently asked questions">
    <div class="container">
      <h2 class="storm-section-h">Storm damage &amp; insurance &mdash; <em>answered</em></h2>
      ${faqs.map((faq, i) => `
      <div class="faq-item">
        <button class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}">
          ${escHtml(faq.q)}
          <svg class="faq-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="faq-a" id="faq-a-${i}" role="region">${escHtml(faq.a)}</div>
      </div>`).join('')}
    </div>
  </section>
</main>

${footer()}
${formScript('Check My Roof — Free →')}
${faqScript()}
${renderChatWidget()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page 2: Claim Help Quiz — /claim-help
// ---------------------------------------------------------------------------

function renderClaimHelpPage(rep: RepCtx): string {
  const title = 'Is Your Roof Damage Covered by Insurance? | Free Assessment | The Roof Docs';
  const desc = 'Answer 4 quick questions to find out if your roof damage is covered by your homeowner\'s insurance. Free inspection from The Roof Docs — VA, MD, PA.';

  // Slim rep strip — shown ONLY when a rep's link is in play (one identity, no new QR).
  // Uses shared .rep-strip + .rep-strip-dot; green dot, optional rep photo, attribution line.
  const repStrip = rep.isRep
    ? `<div class="rep-strip" aria-label="Your Roof-ER specialist">
        <span class="rep-strip-dot" aria-hidden="true"></span>
        ${rep.image ? `<img src="${escHtml(rep.image)}" alt="Photo of ${escHtml(rep.name)}" width="30" height="30" loading="eager">` : ''}
        <span>Your Roof-ER specialist: <b>${escHtml(rep.name)}</b></span>
      </div>`
    : '';

  return `${htmlHead(title, desc)}
${navBar(rep.phone)}
${repBoot(rep)}

<style>
  /* ── Bespoke claim-help skin — cinematic ink/red, ports the brand-video look ── */
  /* Palette only: ink #0A0A0A, brand red #B70808 (gradient top #d40a0a), white, muted #9ca3af. */

  /* Hero: deepen the existing red radial glow with a slow storm sweep + scanning seam.
     PHOTO-SLOT: drop a darkened IG/job hero photo into .ch-hero as a background-image
     layered UNDER these gradients (e.g. linear-gradient(...) , url('REAL_PHOTO')). */
  .ch-hero{position:relative;overflow:hidden;padding:60px 0 28px}
  .ch-hero::before{content:'';position:absolute;inset:-2px;
    background:radial-gradient(ellipse 90% 70% at 50% -14%, rgba(212,10,10,0.26), rgba(183,8,8,0.05) 46%, transparent 72%);
    pointer-events:none;z-index:0}
  .ch-hero::after{content:'';position:absolute;left:0;right:0;top:0;height:1px;
    background:linear-gradient(90deg,transparent,rgba(212,10,10,0.7),transparent);
    opacity:0.55;animation:chSeam 7s ease-in-out infinite;pointer-events:none;z-index:0}
  @keyframes chSeam{0%,100%{transform:translateY(8px);opacity:0.25}50%{transform:translateY(52px);opacity:0.7}}
  .ch-hero>*{position:relative;z-index:1}

  /* Storm-streak texture behind the hero — pure CSS, no image (rain/red motif). */
  .ch-streaks{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0.5;
    background-image:repeating-linear-gradient(115deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 22px),
      repeating-linear-gradient(115deg, rgba(183,8,8,0.10) 0 1px, transparent 1px 64px);
    mask-image:radial-gradient(ellipse 80% 70% at 50% 0%, #000 30%, transparent 78%);
    -webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 0%, #000 30%, transparent 78%);
    animation:chDrift 18s linear infinite}
  @keyframes chDrift{from{background-position:0 0,0 0}to{background-position:-220px 0,-90px 0}}

  .ch-hero .hero-title{font-size:clamp(36px,7vw,64px);line-height:0.96}
  .ch-hero .hero-sub{max-width:520px}

  /* Quiz shell: a focused cinematic card the steps live inside. */
  .ch-shell{position:relative;background:linear-gradient(180deg, rgba(26,26,26,0.92), rgba(14,14,14,0.92));
    border:1px solid ${BRAND.border};border-radius:18px;padding:34px 30px 30px;
    box-shadow:0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04);overflow:hidden}
  .ch-shell::before{content:'';position:absolute;inset:0;border-radius:18px;padding:1px;
    background:linear-gradient(180deg, rgba(212,10,10,0.45), rgba(183,8,8,0) 42%);
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
  @media(max-width:480px){.ch-shell{padding:26px 18px 22px}}

  /* Step chip + counter row. */
  .ch-meta{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}
  .ch-chip{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;
    letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.red};
    background:rgba(183,8,8,0.12);border:1px solid rgba(183,8,8,0.30);border-radius:99px;padding:5px 12px}
  .ch-chip .dot{width:7px;height:7px;border-radius:50%;background:${BRAND.red};box-shadow:0 0 10px rgba(212,10,10,0.9)}
  .ch-shell .step-counter{margin:0;text-align:right}

  /* Progress bar with a moving sheen. */
  .ch-shell .progress-bar-wrap{height:7px;margin-bottom:30px;background:rgba(255,255,255,0.07)}
  .ch-shell .progress-bar-fill{background:linear-gradient(90deg,#d40a0a,${BRAND.red});position:relative}
  .ch-shell .progress-bar-fill::after{content:'';position:absolute;inset:0;border-radius:99px;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent);
    background-size:200% 100%;animation:chSheen 2.4s linear infinite}
  @keyframes chSheen{from{background-position:200% 0}to{background-position:-200% 0}}

  /* Big Anton question headline inside each step. */
  .ch-shell .quiz-q{font-family:'Anton','Inter',sans-serif;font-weight:400;
    font-size:clamp(24px,5vw,38px);line-height:1.04;letter-spacing:0.3px;margin-bottom:26px}
  .ch-shell .quiz-q em{color:${BRAND.red};font-style:normal}

  /* Answer options — restyled radio buttons with a left accent + lift on hover. */
  .ch-shell .radio-group{gap:11px;max-width:440px}
  .ch-shell .radio-opt{position:relative;display:flex;align-items:center;
    background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);border-radius:12px;
    padding:15px 18px 15px 22px;font-size:15px;font-weight:600;color:#e5e7eb;
    transition:border-color .16s,background .16s,color .16s,transform .12s,box-shadow .16s}
  .ch-shell .radio-opt::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:3px;
    background:transparent;transition:background .16s}
  .ch-shell .radio-opt:hover{border-color:rgba(212,10,10,0.55);background:rgba(183,8,8,0.08);color:#fff;
    transform:translateY(-1px);box-shadow:0 8px 22px rgba(0,0,0,0.35)}
  .ch-shell .radio-opt:hover::before{background:rgba(212,10,10,0.7)}
  .ch-shell .radio-opt.selected{border-color:${BRAND.red};background:${BRAND.redLight};color:#fff;
    box-shadow:0 0 0 3px rgba(183,8,8,0.18)}
  .ch-shell .radio-opt.selected::before{background:${BRAND.red}}

  /* Result step form lives flush inside the shell (kill the inner card chrome). */
  .ch-shell #step-5 .card{background:transparent;border:none;padding:0;margin:0}

  /* Reassurance ribbon under the quiz — canon stats + credentials, palette-only. */
  .ch-ribbon{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:26px auto 0;max-width:580px}
  .ch-pill{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:${BRAND.textMuted};
    background:rgba(255,255,255,0.03);border:1px solid ${BRAND.border};border-radius:99px;padding:8px 14px}
  .ch-pill b{color:#fff;font-weight:800}
  .ch-pill .tick{color:${BRAND.red};font-weight:900}

  @media (prefers-reduced-motion: reduce){
    .ch-hero::after,.ch-streaks,.ch-shell .progress-bar-fill::after{animation:none}
  }
</style>

<main>
  <section class="hero ch-hero">
    <div class="ch-streaks" aria-hidden="true"></div>
    <div class="container">
      ${repStrip}
      <div class="hero-eyebrow">Free Insurance Assessment</div>
      <h1 class="hero-title">Is Your Roof Damage <em>Covered?</em></h1>
      <p class="hero-sub">Answer 4 quick questions and find out in under 60 seconds. No cost, no obligation &mdash; just a straight answer from licensed local pros.</p>
    </div>
  </section>

  <section aria-label="Insurance claim quiz" style="padding:14px 0 48px">
    <div class="quiz-wrap">
      <div class="ch-shell">
        <div class="ch-meta">
          <span class="ch-chip"><span class="dot" aria-hidden="true"></span>Claim Check</span>
          <div class="step-counter" id="step-counter" aria-live="polite">Step 1 of 5</div>
        </div>
        <div class="progress-bar-wrap" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20" aria-label="Quiz progress">
          <div class="progress-bar-fill" id="progress-fill" style="width:20%"></div>
        </div>

        <!-- Step 1: When did damage occur? -->
        <div class="quiz-step active" id="step-1" role="group" aria-labelledby="q1-label">
          <h2 class="quiz-q" id="q1-label">When did the <em>damage</em> occur?</h2>
          <div class="radio-group">
            <button class="radio-opt" data-value="7days" onclick="selectOpt(this,1)">Last 7 days</button>
            <button class="radio-opt" data-value="30days" onclick="selectOpt(this,1)">Last 30 days</button>
            <button class="radio-opt" data-value="6months" onclick="selectOpt(this,1)">Last 6 months</button>
            <button class="radio-opt" data-value="over6months" onclick="selectOpt(this,1)">Over 6 months ago</button>
            <button class="radio-opt" data-value="not_sure" onclick="selectOpt(this,1)">Not sure</button>
          </div>
        </div>

        <!-- Step 2: Type of damage -->
        <div class="quiz-step" id="step-2" role="group" aria-labelledby="q2-label">
          <h2 class="quiz-q" id="q2-label">What <em>type</em> of damage do you have?</h2>
          <div class="radio-group">
            <button class="radio-opt" data-value="hail" onclick="selectOpt(this,2)">Hail damage</button>
            <button class="radio-opt" data-value="wind" onclick="selectOpt(this,2)">Wind damage</button>
            <button class="radio-opt" data-value="tree_debris" onclick="selectOpt(this,2)">Tree or debris impact</button>
            <button class="radio-opt" data-value="leak_water" onclick="selectOpt(this,2)">Leak or water damage</button>
            <button class="radio-opt" data-value="multiple" onclick="selectOpt(this,2)">Multiple types</button>
            <button class="radio-opt" data-value="not_sure" onclick="selectOpt(this,2)">Not sure</button>
          </div>
        </div>

        <!-- Step 3: Insurance? -->
        <div class="quiz-step" id="step-3" role="group" aria-labelledby="q3-label">
          <h2 class="quiz-q" id="q3-label">Do you have <em>homeowner's</em> insurance?</h2>
          <div class="radio-group">
            <button class="radio-opt" data-value="yes" onclick="selectOpt(this,3)">Yes, I have coverage</button>
            <button class="radio-opt" data-value="no" onclick="selectOpt(this,3)">No, I don't have insurance</button>
            <button class="radio-opt" data-value="not_sure" onclick="selectOpt(this,3)">Not sure / need to check</button>
          </div>
        </div>

        <!-- Step 4: Claim filed? -->
        <div class="quiz-step" id="step-4" role="group" aria-labelledby="q4-label">
          <h2 class="quiz-q" id="q4-label">Have you <em>filed</em> a claim yet?</h2>
          <div class="radio-group">
            <button class="radio-opt" data-value="approved" onclick="selectOpt(this,4)">Yes &mdash; claim approved</button>
            <button class="radio-opt" data-value="denied" onclick="selectOpt(this,4)">Yes &mdash; claim denied</button>
            <button class="radio-opt" data-value="pending" onclick="selectOpt(this,4)">Yes &mdash; claim pending</button>
            <button class="radio-opt" data-value="no" onclick="selectOpt(this,4)">No, haven't filed yet</button>
            <button class="radio-opt" data-value="not_sure" onclick="selectOpt(this,4)">Not sure</button>
          </div>
        </div>

        <!-- Step 5: Lead capture -->
        <div class="quiz-step" id="step-5">
          <h2 class="quiz-q" id="quiz-result-headline">Great news &mdash; you likely qualify for a <em>FREE inspection.</em></h2>
          <div class="card" style="margin-top:0">
            <p class="card-subtitle" id="quiz-result-body" style="margin-bottom:22px">Enter your details and one of our inspection specialists will call you within 1 hour.</p>
            <form id="lead-form" novalidate aria-label="Lead capture form">
              <input type="hidden" name="source" value="claim_quiz">
              <input type="hidden" name="quiz_when" id="hid-when">
              <input type="hidden" name="quiz_damage_type" id="hid-damage">
              <input type="hidden" name="quiz_has_insurance" id="hid-insurance">
              <input type="hidden" name="quiz_claim_status" id="hid-claim">

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="name">Full Name <span class="req" aria-hidden="true">*</span></label>
                  <input class="form-control" id="name" name="name" type="text" placeholder="Jane Smith" required autocomplete="name">
                </div>
                <div class="form-group">
                  <label class="form-label" for="phone">Phone Number <span class="req" aria-hidden="true">*</span></label>
                  <input class="form-control" id="phone" name="phone" type="tel" placeholder="${escHtml(ROOFCHECK_PHONE)}" required autocomplete="tel">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="email">Email Address</label>
                <input class="form-control" id="email" name="email" type="email" placeholder="jane@example.com" autocomplete="email">
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="address">Property Address</label>
                  <input class="form-control" id="address" name="address" type="text" placeholder="123 Main St" autocomplete="street-address">
                </div>
                <div class="form-group">
                  <label class="form-label" for="zip">ZIP Code</label>
                  <input class="form-control" id="zip" name="zip" type="text" placeholder="22150" inputmode="numeric" maxlength="10" autocomplete="postal-code">
                </div>
              </div>

              <button type="submit" class="btn-submit">Get My Free Assessment &rarr;</button>
              <p class="form-note">&#128274; Your information is private and will never be sold.</p>
            </form>
          </div>
        </div>
      </div>

      <!-- Reassurance ribbon: canon stats (8,000+ projects / 8 years) + credentials. -->
      <div class="ch-ribbon" aria-label="Why homeowners trust The Roof Docs">
        <span class="ch-pill"><b>8,000+</b> roofs restored</span>
        <span class="ch-pill"><b>8 years</b> serving VA &middot; MD &middot; PA</span>
        <span class="ch-pill"><span class="tick" aria-hidden="true">&#10003;</span> GAF Master Elite <b>(top 2%)</b></span>
        <span class="ch-pill"><span class="tick" aria-hidden="true">&#10003;</span> BBB <b>A+</b> Rated</span>
      </div>
    </div>
  </section>

  <!-- Trust credentials: GAF Master Elite, BBB A+, certifications (licenses live in footer). -->
  <section aria-label="Trust credentials">
    <div class="container-wide">
      ${trustBadges()}
    </div>
  </section>
</main>

${footer()}

<script>
(function(){
  var answers = {when:null,damage:null,insurance:null,claim:null};
  var current = 1;
  var total = 5;

  function updateProgress(step){
    var pct = Math.round((step / total) * 100);
    var fill = document.getElementById('progress-fill');
    var bar = fill.closest('[role="progressbar"]');
    var counter = document.getElementById('step-counter');
    fill.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', pct);
    counter.textContent = 'Step ' + step + ' of ' + total;
  }

  function showStep(n){
    document.querySelectorAll('.quiz-step').forEach(function(s){s.classList.remove('active')});
    var el = document.getElementById('step-' + n);
    if(el){ el.classList.add('active'); el.querySelector('button,input')?.focus(); }
    updateProgress(n);
    current = n;
  }

  window.selectOpt = function(btn, step){
    var group = btn.closest('.radio-group');
    group.querySelectorAll('.radio-opt').forEach(function(b){b.classList.remove('selected')});
    btn.classList.add('selected');

    var value = btn.getAttribute('data-value');
    if(step === 1) answers.when = value;
    else if(step === 2) answers.damage = value;
    else if(step === 3) answers.insurance = value;
    else if(step === 4){
      answers.claim = value;
      applyQuizLogic();
    }

    setTimeout(function(){
      if(step < 4) showStep(step + 1);
      else showStep(5);
    }, 280);
  };

  function applyQuizLogic(){
    var headline = document.getElementById('quiz-result-headline');
    var body = document.getElementById('quiz-result-body');
    var w = answers.when;
    var ins = answers.insurance;
    var cl = answers.claim;

    var h, b;
    if(cl === 'denied'){
      h = 'We specialize in <em style="color:${BRAND.red}">denied claim reversals.</em>';
      b = 'A denial isn\\'t final. Our team reviews adjuster reports and often recovers full coverage for our clients.';
    } else if(ins === 'no'){
      h = 'No insurance? We offer <em style="color:${BRAND.red}">affordable financing options.</em>';
      b = 'We work with homeowners in all situations. Our team will walk you through financing and any available assistance programs.';
    } else if(w === 'over6months'){
      h = 'Time may be <em style="color:${BRAND.red}">limited &mdash; act now.</em>';
      b = 'Claim windows vary by insurer. Let us inspect your roof before evidence degrades further and your options narrow.';
    } else {
      h = 'Great news &mdash; you likely qualify for a <em style="color:${BRAND.red}">FREE inspection.</em>';
      b = 'Enter your details and one of our inspection specialists will contact you within 1 hour.';
    }

    headline.innerHTML = h;
    body.textContent = b;

    document.getElementById('hid-when').value = answers.when || '';
    document.getElementById('hid-damage').value = answers.damage || '';
    document.getElementById('hid-insurance').value = answers.insurance || '';
    document.getElementById('hid-claim').value = answers.claim || '';
  }

  updateProgress(1);

  /* Form submit — preserves the /api/leads/intake flow + window.__rep attribution */
  var form = document.getElementById('lead-form');
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Submitting\\u2026';
    var data = Object.fromEntries(new FormData(form));
    if(window.__rep && window.__rep.slug){ data.repSlug = window.__rep.slug; }
    try{
      var res = await fetch('/api/leads/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      var result = await res.json();
      if(result.success){
        form.innerHTML = '<div class="success-box"><div class="success-icon">&#10003;</div><h2 class="success-title">You\\'re All Set!</h2><p class="success-body">We\\'ll contact you within 1 hour to schedule your free inspection.</p></div>';
      } else {
        alert(result.error || 'Submission failed. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Get My Free Assessment \\u2192';
      }
    } catch(err){
      alert('Network error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Get My Free Assessment \\u2192';
    }
  });
})();
</script>
${renderChatWidget()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page 3: Referral Landing — /refer/:code
// ---------------------------------------------------------------------------

function renderReferralPage(referRep: Record<string, any> | null, code: string, rep: RepCtx): string {
  const hasRep = !!referRep;
  const repName: string = referRep?.rep_name || '';
  const repFirst: string = repName.split(' ')[0] || 'your rep';
  const repTitle: string = referRep?.rep_title || 'Roofing Specialist';
  const repPhone: string = referRep?.rep_phone || '';
  const repImage: string = referRep?.image_url || '';
  const initials: string = repName
    .split(' ')
    .map((n: string) => n[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const title = hasRep
    ? `${repName} Recommended You | The Roof Docs`
    : 'Recommended Roofing Professional | The Roof Docs';
  const desc = hasRep
    ? `A neighbor trusted ${repName} at The Roof Docs. Claim your free, no-obligation roof inspection — licensed in VA, MD & PA. 8,000+ roofs, GAF Master Elite.`
    : 'Schedule your free roof inspection with The Roof Docs. Licensed and insured — VA, MD, PA. GAF Master Elite, BBB A+.';

  const heroTitle = hasRep
    ? `A neighbor trusted <em>${escHtml(repName)}</em>.<br>Now it's your turn.`
    : `Your roof deserves a <em>real</em> inspection.`;

  const heroSub = hasRep
    ? `${escHtml(repName)} handled a roofing project for someone close to you &mdash; and they thought you should know. Same team, same care: a <strong>free, no-obligation inspection</strong> documented by certified pros.`
    : `Certified inspectors serving VA, MD &amp; PA. Storm damage, insurance claims, replacements, repairs &mdash; documented start to finish.`;

  const repPhoneFormatted = repPhone
    ? `<a href="tel:${repPhone.replace(/\D/g, '')}" class="rep-phone">&#9742; ${escHtml(repPhone)}</a>`
    : '';

  // The existing rep card, built from the referrer (referRep) row — preserved.
  const repCardHtml = hasRep
    ? `<div class="rep-card refer-rep-card" aria-label="Your recommended representative">
        ${repImage
          ? /* PHOTO-SLOT: rep headshot — real image_url from employee_profiles (DB), not a guessed URL */
            `<img class="rep-avatar" src="${escHtml(repImage)}" alt="Photo of ${escHtml(repName)}" width="80" height="80" loading="eager">`
          : `<div class="rep-avatar-initials" aria-hidden="true">${escHtml(initials)}</div>`}
        <div class="rep-info">
          <div class="refer-rep-kicker">Personally recommended</div>
          <div class="rep-name">${escHtml(repName)}</div>
          <div class="rep-title">${escHtml(repTitle)} &mdash; The Roof Docs</div>
          ${repPhoneFormatted}
        </div>
      </div>`
    : '';

  // Slim rep strip — shown only when the visitor arrived via a rep's link (one identity).
  const repStripHtml = rep.isRep
    ? `<div class="rep-strip" aria-label="Your Roof-ER specialist">
        <span class="rep-strip-dot" aria-hidden="true"></span>
        ${rep.image ? `<img src="${escHtml(rep.image)}" alt="${escHtml(rep.name)}" loading="lazy">` : ''}
        <span>Your Roof-ER specialist: <b>${escHtml(rep.name)}</b></span>
      </div>`
    : '';

  const services = [
    { value: '', label: 'Select a service…' },
    { value: 'storm_damage', label: 'Storm Damage Inspection' },
    { value: 'roof_inspection', label: 'Free Roof Inspection' },
    { value: 'roof_replacement', label: 'Roof Replacement' },
    { value: 'roof_repair', label: 'Roof Repair' },
    { value: 'insurance_claim', label: 'Insurance Claim Assistance' },
    { value: 'gutters', label: 'Gutters' },
    { value: 'siding', label: 'Siding' },
    { value: 'other', label: 'Other / Not Sure' },
  ];

  // Canon stats only: 8,000+ projects / 8 years (+ standing credentials).
  const proofStats = [
    { num: '8,000+', label: 'Roofs restored' },
    { num: '8 yrs', label: 'Serving the DMV' },
    { num: 'Top 2%', label: 'GAF Master Elite' },
    { num: 'A+', label: 'BBB rated' },
  ];

  const trustPoints = [
    { icon: '&#9201;', title: 'One-hour callback', desc: `${hasRep ? escHtml(repFirst) : 'Our team'} reaches out within 60 minutes — no phone-tag.` },
    { icon: '&#128221;', title: 'Documented, not guessed', desc: 'Every finding photographed and explained in plain English.' },
    { icon: '&#128737;', title: 'We handle the claim', desc: 'We work directly with your adjuster, start to finish.' },
  ];

  return `${htmlHead(title, desc)}
${repBoot(rep)}
${navBar(rep.phone)}

<style>
  /* ── Referral page — bespoke cinematic touches (approved brand palette only) ── */
  .refer-hero{padding:64px 0 36px}
  .refer-hero .hero-title{margin-bottom:18px}
  /* deeper, layered red glow over the shared .hero::before radial */
  .refer-hero::after{content:'';position:absolute;inset:0;
    background:
      radial-gradient(120% 80% at 50% 120%, rgba(183,8,8,0.10), transparent 60%),
      linear-gradient(180deg, transparent 55%, rgba(10,10,10,0.6) 100%);
    pointer-events:none;z-index:0}
  .refer-hero>*{position:relative;z-index:1}

  /* "a neighbor trusted [rep]" warmth line under the hero */
  .refer-warm{display:inline-flex;align-items:center;gap:9px;color:${BRAND.textMuted};
    font-size:13px;font-weight:600;letter-spacing:.01em;margin-top:6px}
  .refer-warm .refer-quote{color:${BRAND.red};font-family:'Anton','Inter',sans-serif;
    font-size:22px;line-height:0;position:relative;top:5px}

  /* cinematic storm band behind the rep card — CSS only, real photo can drop into the slot */
  .refer-band{position:relative;border-radius:16px;overflow:hidden;margin-bottom:24px;
    background:
      radial-gradient(90% 140% at 18% -10%, rgba(183,8,8,0.22), transparent 55%),
      linear-gradient(135deg, #141414 0%, #0d0d0d 60%, #161616 100%);
    border:1px solid ${BRAND.border}}
  /* faint diagonal "rain/storm" texture — pure CSS */
  .refer-band::before{content:'';position:absolute;inset:0;opacity:.5;pointer-events:none;
    background:repeating-linear-gradient(115deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 9px)}
  .refer-band-inner{position:relative;padding:22px 22px 6px}
  .refer-rep-card{background:rgba(255,255,255,0.03);margin-bottom:18px}
  .refer-rep-kicker{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
    color:${BRAND.red};margin-bottom:5px}

  /* proof stat row — Anton numerals, high contrast, depth */
  .refer-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 28px}
  .refer-stat{background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;
    padding:16px 10px;text-align:center}
  .refer-stat .n{font-family:'Anton','Inter',sans-serif;font-weight:400;font-size:clamp(22px,5vw,30px);
    line-height:1;letter-spacing:.4px;color:#fff}
  .refer-stat .l{font-size:11px;color:${BRAND.textMuted};margin-top:6px;letter-spacing:.02em}
  @media(max-width:560px){.refer-stats{grid-template-columns:repeat(2,1fr)}}

  /* trust points */
  .refer-points{display:grid;gap:10px;margin:0 0 28px}
  .refer-point{display:flex;gap:13px;align-items:flex-start;background:${BRAND.card};
    border:1px solid ${BRAND.border};border-radius:12px;padding:15px 16px}
  .refer-point .ico{font-size:20px;line-height:1.2;flex-shrink:0}
  .refer-point h3{font-size:14px;font-weight:700;margin-bottom:2px}
  .refer-point p{font-size:12.5px;color:${BRAND.textMuted}}

  /* section heading in the brand display face */
  .refer-h{font-family:'Anton','Inter',sans-serif;font-weight:400;letter-spacing:.4px;
    font-size:clamp(22px,4.5vw,30px);line-height:1.08;text-align:center;margin-bottom:6px}
  .refer-h em{color:${BRAND.red};font-style:normal}
  .refer-h-sub{text-align:center;color:${BRAND.textMuted};font-size:14px;max-width:440px;margin:0 auto 24px}
</style>

<main>
  <section class="hero refer-hero">
    <div class="container">
      <div class="hero-eyebrow">${hasRep ? 'A Personal Referral' : 'Free Inspection'}</div>
      ${repStripHtml}
      <h1 class="hero-title">${heroTitle}</h1>
      <p class="hero-sub">${heroSub}</p>
      ${hasRep ? `<div class="refer-warm"><span class="refer-quote">&ldquo;</span> A neighbor put their roof in ${escHtml(repFirst)}'s hands.</div>` : ''}
    </div>
  </section>

  <section aria-label="Referred representative and lead form">
    <div class="container">
      ${hasRep ? `<!-- PHOTO-SLOT: IG or job photo (cinematic storm band; CSS-only until a real photo drops in) -->
      <div class="refer-band">
        <div class="refer-band-inner">
          ${repCardHtml}
        </div>
      </div>` : ''}

      <div class="refer-stats" role="list" aria-label="The Roof Docs by the numbers">
        ${proofStats.map(s => `<div class="refer-stat" role="listitem"><div class="n">${s.num}</div><div class="l">${escHtml(s.label)}</div></div>`).join('\n        ')}
      </div>

      <div class="card">
        <h2 class="card-title">Request Your Free Inspection</h2>
        <p class="card-subtitle">Fill out the form and ${hasRep ? escHtml(repFirst) : 'our team'} will reach out within 1 hour.</p>

        <form id="lead-form" novalidate aria-label="Referral lead capture form">
          <input type="hidden" name="source" value="referral">
          <input type="hidden" name="referralCode" value="${escHtml(code)}">
          ${hasRep ? `<input type="hidden" name="repProfileId" value="${escHtml(String(referRep?.profile_id ?? ''))}">` : ''}

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="name">Full Name <span class="req" aria-hidden="true">*</span></label>
              <input class="form-control" id="name" name="name" type="text" placeholder="Jane Smith" required autocomplete="name">
            </div>
            <div class="form-group">
              <label class="form-label" for="phone">Phone Number <span class="req" aria-hidden="true">*</span></label>
              <input class="form-control" id="phone" name="phone" type="tel" placeholder="(703) 239-3738" required autocomplete="tel">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email Address</label>
            <input class="form-control" id="email" name="email" type="email" placeholder="jane@example.com" autocomplete="email">
          </div>

          <div class="form-group">
            <label class="form-label" for="address">Property Address</label>
            <input class="form-control" id="address" name="address" type="text" placeholder="123 Main St, Springfield, VA 22150" autocomplete="street-address">
          </div>

          <div class="form-group">
            <label class="form-label" for="service_needed">Service Needed</label>
            <select class="form-control" id="service_needed" name="service_needed">
              ${services.map(s => `<option value="${escHtml(s.value)}">${escHtml(s.label)}</option>`).join('')}
            </select>
          </div>

          <button type="submit" class="btn-submit">Request Free Inspection &rarr;</button>
          <p class="form-note">&#128274; Your information is private and will never be sold.</p>
        </form>
      </div>

      <h2 class="refer-h">Why neighbors keep <em>calling us back</em></h2>
      <p class="refer-h-sub">The same standard whether you were referred or found us cold.</p>
      <div class="refer-points">
        ${trustPoints.map(p => `<div class="refer-point"><div class="ico" aria-hidden="true">${p.icon}</div><div><h3>${escHtml(p.title)}</h3><p>${p.desc}</p></div></div>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section aria-label="Trust credentials">
    <div class="container-wide">
      ${trustBadges()}
    </div>
  </section>

  <section aria-label="Licensing" style="padding:0 0 12px">
    <div class="container">
      <p style="text-align:center;font-size:12px;color:${BRAND.textDim};line-height:1.7">
        Licensed &amp; insured &mdash; VA #${BRAND.vaLicense} &bull; MD MHIC #${BRAND.mdLicense} &bull; PA #${BRAND.paLicense}<br>
        GAF Master Elite (top 2% of roofers) &bull; BBB A+ Accredited
      </p>
    </div>
  </section>
</main>

${footer()}
${formScript('Request Free Inspection →')}
${renderChatWidget()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page 4: Free Inspection — /free-inspection
// ---------------------------------------------------------------------------

function renderFreeInspectionPage(rep: RepCtx): string {
  const title = 'Free Roof Inspection | Licensed & GAF Master Elite | The Roof Docs';
  const desc = 'Schedule your 100% free roof inspection with The Roof Docs. GAF Master Elite (top 2% of roofers), A+ BBB rated, fully licensed. Serving Virginia, Maryland & Pennsylvania.';

  // Rep strip — shown ONLY when a rep's link is in play. One identity, no new QR codes.
  const repStrip = rep.isRep
    ? `<div class="rep-strip" aria-label="Your assigned specialist">
        <span class="rep-strip-dot" aria-hidden="true"></span>
        ${rep.image ? `<img src="${escHtml(rep.image)}" alt="Photo of ${escHtml(rep.name)}" loading="eager">` : ''}
        <span>Your Roof-ER specialist: <b>${escHtml(rep.name)}</b></span>
      </div>`
    : '';

  const services = [
    { value: '', label: 'What brings you in today?…' },
    { value: 'storm_damage', label: 'Storm Damage / Hail' },
    { value: 'roof_inspection', label: 'General Roof Inspection' },
    { value: 'roof_replacement', label: 'Roof Replacement' },
    { value: 'roof_repair', label: 'Roof Repair' },
    { value: 'insurance_claim', label: 'Insurance Claim Help' },
    { value: 'leak', label: 'Leak / Water Damage' },
    { value: 'gutters', label: 'Gutters' },
    { value: 'siding', label: 'Siding' },
    { value: 'other', label: 'Other / Not Sure' },
  ];

  // Canon stats only — 8,000+ projects, 8 years. Do not invent others.
  // `num` is the figure; `unit` (if any) renders in red via <em>.
  const stats: Array<{ num: string; unit?: string; label: string }> = [
    { num: '8,000', unit: '+', label: 'Roofs inspected & restored' },
    { num: '8', unit: 'yrs', label: 'Serving the DMV' },
    { num: 'Top ', unit: '2%', label: 'GAF Master Elite contractor' },
    { num: '1', unit: 'hr', label: 'Average callback time' },
  ];

  const whyUs = [
    { icon: '&#127942;', title: 'GAF Master Elite', desc: 'A distinction held by only the top 2% of roofers nationwide.' },
    { icon: '&#128737;', title: 'Licensed & Insured', desc: 'Fully credentialed across VA, MD &amp; PA &mdash; every job, every time.' },
    { icon: '&#128247;', title: 'Documented Findings', desc: 'Photo report of everything we find &mdash; yours to keep, same day.' },
    { icon: '&#128176;', title: '100% Free', desc: 'No cost, no pressure, no obligation. An honest assessment, period.' },
  ];

  const licenses = [
    { st: 'Virginia', num: '#2705194709' },
    { st: 'Maryland', num: 'MHIC #164697' },
    { st: 'Pennsylvania', num: '#145926' },
  ];

  const faqs = [
    {
      q: 'Is the inspection really free?',
      a: 'Yes — 100% free with no obligation. We inspect your roof, document any damage with photos, and give you a detailed report. No pressure, no strings attached.',
    },
    {
      q: 'How long does an inspection take?',
      a: 'A typical inspection takes 30–45 minutes. We examine the roof surface, flashing, gutters, ventilation, and attic (when accessible). You’ll receive your report the same day.',
    },
    {
      q: 'What if you find damage?',
      a: 'We walk you through exactly what we found, explain your options, and help determine if your homeowner’s insurance may cover the repairs. We handle the entire claims process at no extra cost to you.',
    },
    {
      q: 'Are you licensed and insured?',
      a: 'Absolutely. We’re licensed in Virginia (#2705194709), Maryland (MHIC #164697), and Pennsylvania (#145926). We’re also a GAF Master Elite contractor — a distinction held by only the top 2% of roofers nationwide.',
    },
    {
      q: 'What areas do you serve?',
      a: 'We serve Virginia, Maryland, and Pennsylvania — including the greater Washington D.C. metro area, Northern Virginia, Baltimore metro, and surrounding counties.',
    },
  ];

  return `${htmlHead(title, desc, 'https://get.theroofdocs.com/free-inspection')}
${repBoot(rep)}
${navBar(rep.phone)}
<div class="urgency-banner" role="alert">&#128293; Limited Availability &mdash; Book Your Free Inspection Today</div>

<style>
  /* ── Page-scoped uplift: cinematic, brand-video look (ink + brand red, Anton) ── */
  /* PHOTO-SLOT: hero background — a real storm/job/IG photo can drop in as a background-image
     layer below the gradients on .fi-hero. Until then, a pure-CSS storm/red treatment runs. */
  .fi-hero{position:relative;overflow:hidden;padding:60px 0 40px;
    background:
      radial-gradient(120% 80% at 50% -20%, rgba(212,10,10,0.22), transparent 60%),
      linear-gradient(180deg, #0e0e0e 0%, ${BRAND.bg} 70%)}
  /* diagonal "storm sheet" streaks — CSS only, very subtle, slow drift */
  .fi-hero::after{content:'';position:absolute;inset:-40% -10%;pointer-events:none;opacity:0.06;
    background:repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 9px);
    transform:translateY(-6%);animation:fiRain 14s linear infinite}
  @keyframes fiRain{from{transform:translateY(-6%)}to{transform:translateY(6%)}}
  @media(prefers-reduced-motion:reduce){.fi-hero::after{animation:none}}
  .fi-hero>*{position:relative;z-index:1}
  .fi-hero .hero-title{margin-bottom:18px}
  /* thin red rule under the hero, like the brand-video lower-third */
  .fi-rule{width:64px;height:3px;border-radius:3px;margin:0 auto 22px;
    background:linear-gradient(90deg,#d40a0a,${BRAND.red});box-shadow:0 0 18px rgba(183,8,8,0.6)}

  /* inline trust line under the hero CTA */
  .fi-trustline{display:flex;flex-wrap:wrap;gap:8px 18px;justify-content:center;align-items:center;
    margin-top:18px;font-size:12.5px;font-weight:600;color:${BRAND.textMuted};letter-spacing:0.01em}
  .fi-trustline .dot{width:5px;height:5px;border-radius:50%;background:${BRAND.red};display:inline-block;margin-right:8px;vertical-align:middle}

  /* stats band — cinematic high-contrast numbers in Anton */
  .fi-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;
    background:${BRAND.border};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;margin:14px 0 4px}
  .fi-stat{background:linear-gradient(180deg,#161616,#121212);padding:22px 14px;text-align:center}
  .fi-stat .n{font-family:'Anton','Inter',sans-serif;font-weight:400;font-size:clamp(26px,4.4vw,38px);
    line-height:1;letter-spacing:0.5px;color:#fff}
  .fi-stat .n em{color:${BRAND.red};font-style:normal}
  .fi-stat .l{font-size:11.5px;color:${BRAND.textMuted};margin-top:7px;letter-spacing:0.02em;line-height:1.35}
  @media(max-width:640px){.fi-stats{grid-template-columns:repeat(2,1fr)}}

  /* section heading shared by bespoke blocks */
  .fi-h2{font-family:'Anton','Inter',sans-serif;font-weight:400;letter-spacing:0.4px;
    font-size:clamp(24px,4.4vw,34px);line-height:1.05;text-align:center;margin-bottom:8px}
  .fi-h2 em{color:${BRAND.red};font-style:normal}
  .fi-sub{text-align:center;color:${BRAND.textMuted};font-size:14px;max-width:520px;margin:0 auto 26px}

  /* GAF Master Elite spotlight — the conversion anchor */
  .fi-elite{position:relative;overflow:hidden;border:1px solid rgba(183,8,8,0.28);border-radius:18px;
    padding:30px 26px;margin:10px 0 6px;
    background:radial-gradient(110% 130% at 100% 0%, rgba(183,8,8,0.16), transparent 55%),
      linear-gradient(180deg,#161616,#121212)}
  .fi-elite-row{display:flex;align-items:center;gap:22px}
  .fi-elite-badge{width:104px;height:104px;flex-shrink:0;border-radius:14px;
    background:rgba(255,255,255,0.04);border:1px solid ${BRAND.border};display:flex;align-items:center;justify-content:center;padding:10px}
  .fi-elite-badge img{height:84px;width:auto;object-fit:contain}
  .fi-elite h3{font-family:'Anton','Inter',sans-serif;font-weight:400;letter-spacing:0.4px;font-size:24px;line-height:1.05;margin-bottom:8px}
  .fi-elite h3 em{color:${BRAND.red};font-style:normal}
  .fi-elite p{font-size:13.5px;color:${BRAND.textMuted};line-height:1.6}
  @media(max-width:520px){.fi-elite-row{flex-direction:column;text-align:center;gap:16px}}

  /* why-us cards — depth + red top edge on hover */
  .fi-why{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .fi-why-card{position:relative;background:linear-gradient(180deg,#161616,#121212);
    border:1px solid ${BRAND.border};border-radius:14px;padding:22px 18px;overflow:hidden;
    transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
  .fi-why-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,transparent,${BRAND.red},transparent);opacity:0;transition:opacity .2s ease}
  .fi-why-card:hover{transform:translateY(-3px);border-color:rgba(183,8,8,0.4);box-shadow:0 14px 30px rgba(0,0,0,0.45)}
  .fi-why-card:hover::before{opacity:1}
  .fi-why-card .ic{font-size:26px;margin-bottom:10px}
  .fi-why-card .t{font-size:14px;font-weight:800;margin-bottom:5px;letter-spacing:0.01em}
  .fi-why-card .d{font-size:12.5px;color:${BRAND.textMuted};line-height:1.55}
  @media(max-width:760px){.fi-why{grid-template-columns:repeat(2,1fr)}}

  /* license chips */
  .fi-licenses{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:20px}
  .fi-chip{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);
    border:1px solid ${BRAND.border};border-radius:99px;padding:9px 16px;font-size:12.5px;color:#d1d5db;font-weight:600}
  .fi-chip .ck{color:${BRAND.green};font-weight:800}
  .fi-chip b{color:#fff;font-weight:700}

  /* form card uplift — give the primary conversion surface a confident frame */
  .fi-formcard{position:relative;overflow:hidden;
    background:radial-gradient(120% 90% at 50% -10%, rgba(183,8,8,0.10), transparent 55%),${BRAND.card};
    border:1px solid rgba(183,8,8,0.22);box-shadow:0 24px 60px rgba(0,0,0,0.5)}
</style>

<main>
  <section class="hero fi-hero">
    <div class="container">
      ${repStrip}
      <div class="hero-eyebrow">100% Free &bull; No Obligation</div>
      <h1 class="hero-title">Get Your <em>Free Roof Inspection</em> Today</h1>
      <div class="fi-rule" aria-hidden="true"></div>
      <p class="hero-sub">Licensed, insured, and trusted across VA, MD &amp; PA. We climb up, document everything with photos, and give you an honest, no-pressure assessment &mdash; at zero cost.</p>
      <a href="#book" class="btn-submit" style="max-width:340px;margin:0 auto">Book My Free Inspection &rarr;</a>
      <div class="fi-trustline" role="list" aria-label="Credentials at a glance">
        <span role="listitem"><span class="dot" aria-hidden="true"></span>GAF Master Elite</span>
        <span role="listitem"><span class="dot" aria-hidden="true"></span>BBB A+ Rated</span>
        <span role="listitem"><span class="dot" aria-hidden="true"></span>VA &middot; MD &middot; PA Licensed</span>
      </div>
    </div>
  </section>

  <!-- Stats band — canon figures only (8,000+ projects, 8 years) -->
  <section aria-label="The Roof Docs by the numbers" style="padding:6px 0 14px">
    <div class="container-wide">
      <div class="fi-stats">
        ${stats.map(s => `
        <div class="fi-stat">
          <div class="n">${escHtml(s.num)}${s.unit ? `<em>${escHtml(s.unit)}</em>` : ''}</div>
          <div class="l">${escHtml(s.label)}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- GAF Master Elite spotlight -->
  <section aria-label="GAF Master Elite certification" style="padding:18px 0">
    <div class="container-wide">
      <div class="fi-elite">
        <div class="fi-elite-row">
          <!-- PHOTO-SLOT: known-good GAF Master Elite badge (BRAND.badgeGafElite) -->
          <div class="fi-elite-badge"><img src="${BRAND.badgeGafElite}" alt="GAF Master Elite Certified Contractor" loading="lazy"></div>
          <div>
            <h3>We're <em>GAF Master Elite</em> &mdash; the top 2% of roofers</h3>
            <p>GAF awards Master Elite status to fewer than 2% of contractors nationwide &mdash; it requires proven craftsmanship, full licensing, insurance, and a track record of doing right by homeowners. It also unlocks the strongest manufacturer warranties in the industry.</p>
            <div class="fi-licenses">
              ${licenses.map(l => `<span class="fi-chip"><span class="ck" aria-hidden="true">&#10003;</span><b>${escHtml(l.st)}</b> ${escHtml(l.num)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Why choose us -->
  <section aria-label="Why choose The Roof Docs" style="padding:18px 0 26px">
    <div class="container-wide">
      <h2 class="fi-h2">Why homeowners <em>choose us</em></h2>
      <p class="fi-sub">Eight years and 8,000+ roofs across the DMV. Here's what that buys you.</p>
      <div class="fi-why">
        ${whyUs.map(item => `
        <div class="fi-why-card">
          <div class="ic" aria-hidden="true">${item.icon}</div>
          <div class="t">${escHtml(item.title)}</div>
          <div class="d">${item.desc}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- Lead Capture Form -->
  <section id="book" aria-label="Lead capture form">
    <div class="container">
      <div class="card fi-formcard">
        <h2 class="card-title">Schedule Your Free Inspection</h2>
        <p class="card-subtitle">Fill out the form below and ${rep.isRep ? `<b>${escHtml((rep.name.split(' ')[0]) || 'your specialist')}</b>` : 'our team'} will contact you within 1 hour.</p>

        <form id="lead-form" novalidate aria-label="Free inspection request form">
          <input type="hidden" name="source" value="free_inspection">

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="name">Full Name <span class="req" aria-hidden="true">*</span></label>
              <input class="form-control" id="name" name="name" type="text" placeholder="Jane Smith" required autocomplete="name">
            </div>
            <div class="form-group">
              <label class="form-label" for="phone">Phone Number <span class="req" aria-hidden="true">*</span></label>
              <input class="form-control" id="phone" name="phone" type="tel" placeholder="${escHtml(ROOFCHECK_PHONE)}" required autocomplete="tel">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email Address</label>
            <input class="form-control" id="email" name="email" type="email" placeholder="jane@example.com" autocomplete="email">
          </div>

          <div class="form-group">
            <label class="form-label" for="address">Property Address <span class="req" aria-hidden="true">*</span></label>
            <input class="form-control" id="address" name="address" type="text" placeholder="123 Main St, Springfield, VA 22150" required autocomplete="street-address">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="zip">ZIP Code</label>
              <input class="form-control" id="zip" name="zip" type="text" placeholder="22150" inputmode="numeric" maxlength="10" autocomplete="postal-code">
            </div>
            <div class="form-group">
              <label class="form-label" for="service_needed">Service Needed</label>
              <select class="form-control" id="service_needed" name="service_needed">
                ${services.map(s => `<option value="${escHtml(s.value)}">${escHtml(s.label)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="preferredDate">Preferred Date</label>
            <input class="form-control" id="preferredDate" name="preferredDate" type="date" min="${new Date().toISOString().split('T')[0]}">
          </div>

          <div class="form-group">
            <label class="form-label" for="message">Anything else we should know?</label>
            <textarea class="form-control" id="message" name="message" placeholder="e.g. I noticed missing shingles after the last storm, or my roof is 20+ years old…" rows="3"></textarea>
          </div>

          <button type="submit" class="btn-submit">Book My Free Inspection &rarr;</button>
          <p class="form-note">&#128274; Your information is private and will never be sold.</p>
        </form>
      </div>
    </div>
  </section>

  <!-- Trust Badges -->
  <section aria-label="Trust credentials">
    <div class="container-wide">
      ${trustBadges()}
    </div>
  </section>

  <!-- FAQ -->
  <section class="faq-section" aria-label="Frequently asked questions">
    <div class="container">
      <h2 class="faq-title">Free Inspection &mdash; Your Questions Answered</h2>
      ${faqs.map((faq, i) => `
      <div class="faq-item">
        <button class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}">
          ${escHtml(faq.q)}
          <svg class="faq-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="faq-a" id="faq-a-${i}" role="region">${escHtml(faq.a)}</div>
      </div>`).join('')}
    </div>
  </section>
</main>

${footer()}
${formScript('Book My Free Inspection →')}
${faqScript()}
${renderChatWidget()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerLeadGenPages(app: Application, pool: Pool): void {

  // AO21 · Susan 21 maker's-mark asset (the footer corner signature)
  const sigPath = existsSync(path.resolve(process.cwd(), 'server/routes/brand/ao21-sig.png'))
    ? path.resolve(process.cwd(), 'server/routes/brand/ao21-sig.png')
    : path.join(path.dirname(new URL(import.meta.url).pathname), 'brand/ao21-sig.png');
  app.get('/brand/ao21-sig.png', (_req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(sigPath);
  });

  // Default promo video — the fallback that fills a rep's empty "Video coming soon" slot
  const promoPath = existsSync(path.resolve(process.cwd(), 'server/routes/brand/roofer-default-promo.mp4'))
    ? path.resolve(process.cwd(), 'server/routes/brand/roofer-default-promo.mp4')
    : path.join(path.dirname(new URL(import.meta.url).pathname), 'brand/roofer-default-promo.mp4');
  app.get('/brand/roofer-default-promo.mp4', (_req, res) => {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(promoPath);
  });

  // ── Page 1: Storm Landing ────────────────────────────────────────────────
  app.get('/storm/:zip', async (req, res) => {
    const { zip } = req.params;
    const rep = await repContext(req, res, pool);

    // Basic ZIP validation — accept 5-digit US ZIPs only
    if (!/^\d{5}$/.test(zip)) {
      res.status(400).set('Content-Type', 'text/html').send(
        renderStormPage(null, zip.slice(0, 10), rep)
      );
      return;
    }

    let storm: Record<string, any> | null = null;
    try {
      const result = await pool.query(
        `SELECT * FROM storm_zones WHERE zip_code = $1 AND is_active = true ORDER BY event_date DESC LIMIT 1`,
        [zip]
      );
      storm = result.rows[0] ?? null;
    } catch (err) {
      // Table may not exist yet in all environments — graceful fallback
      console.error('[leadGenPages] storm_zones query failed:', err);
    }

    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'private, no-store'); // rep-aware (cookie-varied) — never shared-cache
    res.send(renderStormPage(storm, zip, rep));
  });

  // ── Page 2: Claim Help Quiz ───────────────────────────────────────────────
  app.get('/claim-help', async (req, res) => {
    const rep = await repContext(req, res, pool);
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'private, no-store');
    res.send(renderClaimHelpPage(rep));
  });

  // ── Page 4: Free Inspection ──────────────────────────────────────────────
  app.get('/free-inspection', async (req, res) => {
    const rep = await repContext(req, res, pool);
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'private, no-store');
    res.send(renderFreeInspectionPage(rep));
  });

  // ── Page 3: Referral Landing ─────────────────────────────────────────────
  app.get('/refer/:code', async (req, res) => {
    const { code } = req.params;

    // Sanitise: only alphanumeric + hyphen, max 64 chars
    const safeCode = code.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);

    let referRep: Record<string, any> | null = null;
    if (safeCode) {
      try {
        const result = await pool.query(
          `SELECT rc.*, ep.name as rep_name, ep.image_url, ep.phone_number as rep_phone, ep.title as rep_title
           FROM referral_codes rc
           JOIN employee_profiles ep ON ep.id = rc.profile_id
           WHERE rc.code = $1 AND rc.is_active = true
           LIMIT 1`,
          [safeCode]
        );
        referRep = result.rows[0] ?? null;
      } catch (err) {
        // Table may not exist yet — graceful fallback
        console.error('[leadGenPages] referral_codes query failed:', err);
      }
    }

    const rep = await repContext(req, res, pool);
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'private, no-store');
    res.send(renderReferralPage(referRep, safeCode, rep));
  });

  // ── Page 5: Storm Checklist Lead Magnet ─────────────────────────────────
  app.get('/storm-checklist', async (req, res) => {
    const rep = await repContext(req, res, pool);
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'private, no-store');
    res.send(renderStormChecklistPage(rep));
  });
}


// ---------------------------------------------------------------------------
// Page 5 Renderer: Storm Damage Claim Checklist (lead magnet)
// ---------------------------------------------------------------------------

function renderStormChecklistPage(rep: RepCtx): string {
  const title = 'Free Storm Damage Insurance Claim Checklist | The Roof Docs';
  const desc = 'Download the free Storm Damage Insurance Claim Checklist. The step-by-step guide VA, MD & PA homeowners use to document damage and maximize their roof insurance claim.';

  // Slim rep strip — only when a rep's link is in play (one identity, no new QR codes).
  const repStrip = rep.isRep
    ? `<div class="rep-strip" aria-label="Your Roof-ER specialist">
        <span class="rep-strip-dot" aria-hidden="true"></span>
        ${rep.image ? `<img src="${escHtml(rep.image)}" alt="${escHtml(rep.name)}" width="30" height="30" loading="eager">` : ''}
        <span>Your Roof-ER specialist: <b>${escHtml(rep.name)}</b></span>
      </div>`
    : '';

  const checklist = [
    { t: 'Immediate Safety Steps', d: 'What to do in the first 24 hours after a storm — before damage gets worse.' },
    { t: 'Document Everything', d: 'Exactly which photos and videos your adjuster needs to see to approve the claim.' },
    { t: 'Filing Timeline', d: 'Critical deadlines most homeowners miss — and the coverage they lose by waiting.' },
    { t: 'Adjuster Meeting Prep', d: 'The questions to ask, and the red flags to watch for, on inspection day.' },
    { t: 'Supplement Request Template', d: 'The word-for-word script to recover the full amount you’re owed.' },
    { t: 'Contractor Vetting Checklist', d: '7 things to verify (license, insurance, warranty) before you sign anything.' },
  ];

  const perks = [
    { icon: '&#128196;', t: '10-Page Guide', d: 'Printable PDF' },
    { icon: '&#9989;', t: 'Fillable Fields', d: 'Track your progress' },
    { icon: '&#128176;', t: '100% Free', d: 'No strings attached' },
  ];

  return `${htmlHead(title, desc)}
${repBoot(rep)}
${navBar(rep.phone)}

<!-- Page-scoped uplift: cinematic checklist sheet + gate, brand palette only (ink/red/white/muted) -->
<style>
  /* PHOTO-SLOT: hero backdrop — swap the gradient/motif below for a real storm or job photo when available */
  .chk-hero{padding:56px 0 28px}
  .chk-hero .hero-sub{margin-bottom:24px}
  /* the lead-magnet "sheet" — a tilted document peeking out of the ink, with the red glow behind it */
  .chk-sheet{position:relative;background:linear-gradient(180deg,#161616,#101010);border:1px solid ${BRAND.border};border-radius:16px;padding:30px 26px;overflow:hidden}
  .chk-sheet::before{content:'';position:absolute;inset:0;background:radial-gradient(120% 90% at 100% 0%,rgba(183,8,8,0.14),transparent 60%);pointer-events:none}
  .chk-sheet>*{position:relative;z-index:1}
  .chk-kicker{display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.red};margin-bottom:14px}
  .chk-kicker::before{content:'';display:inline-block;width:22px;height:2px;background:${BRAND.red};vertical-align:middle;margin-right:8px}
  .chk-row{display:flex;gap:13px;padding:13px 0;border-bottom:1px solid ${BRAND.border}}
  .chk-row:last-child{border-bottom:none}
  .chk-mark{flex-shrink:0;width:22px;height:22px;border-radius:6px;background:${BRAND.redLight};border:1px solid rgba(183,8,8,0.4);color:${BRAND.red};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;margin-top:1px}
  .chk-row h3{font-size:14.5px;font-weight:700;margin-bottom:2px;letter-spacing:-0.01em}
  .chk-row p{font-size:13px;color:${BRAND.textMuted};line-height:1.5}
  /* perk pills */
  .chk-perks{display:flex;flex-wrap:wrap;gap:12px;margin:22px 0}
  .chk-perk{flex:1;min-width:150px;background:rgba(255,255,255,0.03);border:1px solid ${BRAND.border};border-radius:12px;padding:16px;text-align:center}
  .chk-perk .ic{font-size:26px;margin-bottom:6px}
  .chk-perk h4{font-size:13px;font-weight:700;margin-bottom:3px}
  .chk-perk p{font-size:12px;color:${BRAND.textMuted}}
  /* gate — the focal red moment */
  .chk-gate{position:relative;background:#121212;border:1px solid rgba(183,8,8,0.35);border-radius:16px;padding:32px 26px;margin:26px 0;text-align:center;overflow:hidden}
  .chk-gate::before{content:'';position:absolute;inset:-2px;background:radial-gradient(80% 120% at 50% -10%,rgba(183,8,8,0.22),transparent 65%);pointer-events:none}
  .chk-gate>*{position:relative;z-index:1}
  .chk-gate .gate-eyebrow{display:inline-block;background:${BRAND.redLight};color:${BRAND.red};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:5px 13px;border-radius:20px;border:1px solid rgba(183,8,8,0.3);margin-bottom:14px}
  .chk-gate .gate-title{font-family:'Anton','Inter',sans-serif;font-weight:400;font-size:clamp(26px,5vw,38px);line-height:1.02;letter-spacing:0.3px;margin-bottom:8px}
  .chk-gate .gate-title em{color:${BRAND.red};font-style:normal}
  .chk-gate .gate-sub{font-size:14px;color:${BRAND.textMuted};max-width:380px;margin:0 auto 22px}
  .chk-gate form{display:flex;flex-direction:column;gap:12px;max-width:380px;margin:0 auto;text-align:left}
  .chk-gate .form-note{margin-top:14px}
  /* testimonials — pull-quote with a red rule */
  .chk-quote{position:relative;background:${BRAND.card};border:1px solid ${BRAND.border};border-left:3px solid ${BRAND.red};border-radius:12px;padding:20px 22px;margin:16px 0}
  .chk-quote p{font-size:14.5px;line-height:1.6;color:#e5e7eb;font-style:italic}
  .chk-quote .attr{display:block;margin-top:10px;font-size:13px;font-weight:600;color:#fff;font-style:normal}
  .chk-quote .attr span{color:${BRAND.textMuted};font-weight:400}
  .chk-stat{font-weight:700;color:${BRAND.red};font-style:normal}
  /* licenses ribbon */
  .chk-lic{text-align:center;font-size:12px;color:${BRAND.textMuted};margin:26px 0 6px;letter-spacing:0.02em}
  .chk-lic b{color:#d1d5db;font-weight:600}
  @media(max-width:480px){.chk-sheet{padding:24px 18px}.chk-gate{padding:26px 18px}}
</style>

<main>
  <section class="hero chk-hero">
    <div class="container">
      ${repStrip}
      <div class="hero-eyebrow">Free Homeowner Download</div>
      <h1 class="hero-title">Your Storm Damage<br><em>Insurance</em> Claim Checklist</h1>
      <p class="hero-sub">The step-by-step guide VA, MD &amp; PA homeowners use to document damage, beat the deadlines, and get every dollar their policy owes them.</p>
    </div>
  </section>

  <section aria-label="What's inside the checklist">
    <div class="container">
      <div class="chk-sheet">
        <!-- PHOTO-SLOT: IG or job photo (e.g. inspector on a storm-damaged roof) could sit above this list -->
        <span class="chk-kicker">What’s Inside</span>
        ${checklist.map(c => `
        <div class="chk-row">
          <span class="chk-mark" aria-hidden="true">&#10003;</span>
          <div>
            <h3>${escHtml(c.t)}</h3>
            <p>${escHtml(c.d)}</p>
          </div>
        </div>`).join('')}
      </div>

      <div class="chk-perks" role="list">
        ${perks.map(p => `
        <div class="chk-perk" role="listitem">
          <div class="ic" aria-hidden="true">${p.icon}</div>
          <h4>${escHtml(p.t)}</h4>
          <p>${escHtml(p.d)}</p>
        </div>`).join('')}
      </div>

      <!-- Testimonial (kept) -->
      <figure class="chk-quote">
        <p>&ldquo;I didn’t know I could supplement my claim until I read this checklist. Ended up getting <span class="chk-stat">$4,200 more</span> than the initial estimate.&rdquo;</p>
        <figcaption class="attr">Sarah M. <span>&mdash; Columbia, MD</span></figcaption>
      </figure>
    </div>
  </section>

  <!-- Email Gate (kept) -->
  <section aria-label="Get the free checklist">
    <div class="container">
      <div class="chk-gate" id="gate-form">
        <span class="gate-eyebrow">Instant Delivery</span>
        <h2 class="gate-title">Get the <em>Free</em> Checklist</h2>
        <p class="gate-sub">Enter your email and we’ll send the full checklist instantly &mdash; plus a free roof inspection if you want one.</p>

        <form id="lead-form" novalidate aria-label="Storm damage checklist request form">
          <input type="hidden" name="source" value="claim_help">
          <input type="hidden" name="serviceType" value="storm_damage">
          <input type="hidden" name="message" value="Lead magnet: Storm Damage Insurance Claim Checklist download">
          <!-- rep attribution: seeded from window.__rep (repBoot) so the rep's single link carries credit -->
          <input type="hidden" name="referralCode" id="chk-rep-code" value="">

          <input class="form-control" name="homeownerName" type="text" placeholder="Your name" required autocomplete="name" aria-label="Your name">
          <input class="form-control" name="homeownerEmail" type="email" placeholder="Your email" required autocomplete="email" aria-label="Your email">
          <input class="form-control" name="homeownerPhone" type="tel" placeholder="Phone (optional)" autocomplete="tel" aria-label="Phone number, optional">
          <input class="form-control" name="zipCode" type="text" placeholder="ZIP code (optional)" inputmode="numeric" maxlength="10" autocomplete="postal-code" aria-label="ZIP code, optional">

          <button type="submit" class="btn-submit">Send Me the Checklist &rarr;</button>
          <p class="form-note">&#128274; We respect your privacy. No spam &mdash; just the checklist and the occasional storm alert for your area.</p>
        </form>
      </div>

      <!-- Second testimonial (kept) -->
      <figure class="chk-quote">
        <p>&ldquo;After the hail storm hit Ellicott City, this checklist walked me through everything. My contractor even said I was the most prepared homeowner he’d worked with.&rdquo;</p>
        <figcaption class="attr">James T. <span>&mdash; Ellicott City, MD</span></figcaption>
      </figure>

      <p class="chk-lic">
        <b>Licensed &amp; insured:</b> VA #${BRAND.vaLicense} &bull; MD MHIC #${BRAND.mdLicense} &bull; PA #${BRAND.paLicense}
        &bull; GAF Master Elite (top 2% of roofers) &bull; BBB A+ &bull; 8,000+ projects over 8 years
      </p>
    </div>
  </section>

  <section aria-label="Trust credentials">
    <div class="container-wide">
      ${trustBadges()}
    </div>
  </section>
</main>

${footer()}

<script>
/* Carry rep attribution from window.__rep (seeded by repBoot) into the gated lead form,
   so the rep's single link credits them through the standard /api/leads/intake flow. */
(function(){
  try{
    var slug = (window.__rep && window.__rep.slug) ? String(window.__rep.slug) : '';
    var f = document.getElementById('chk-rep-code');
    if(f && slug) f.value = slug;
  }catch(e){/* noop */}
})();
</script>
${formScript('Send Me the Checklist →')}
${renderChatWidget()}
</body>
</html>`;
}
