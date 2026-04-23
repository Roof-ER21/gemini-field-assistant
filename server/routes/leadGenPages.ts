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

// ---------------------------------------------------------------------------
// Shared design tokens
// ---------------------------------------------------------------------------

const BRAND = {
  red: '#b60807',
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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
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
    .hero-title{font-size:clamp(26px,5vw,40px);font-weight:900;line-height:1.15;letter-spacing:-0.02em;margin-bottom:16px}
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
    .footer{border-top:1px solid ${BRAND.border};padding:28px 0;text-align:center;color:${BRAND.textDim};font-size:13px}
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
        form.innerHTML = '<div class="success-box"><div class="success-icon">&#10003;</div><h2 class="success-title">You\'re All Set!</h2><p class="success-body">We\'ll contact you within 1 hour to schedule your free inspection.</p></div>';
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

function navBar(phoneNumber: string = BRAND.phone): string {
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
      ${escHtml(BRAND.address)} &bull; <a href="tel:+1${BRAND.phone.replace(/\D/g, '')}" style="color:${BRAND.red}">${escHtml(BRAND.phone)}</a>
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

function renderStormPage(storm: Record<string, any> | null, zip: string): string {
  const hasStorm = !!storm;
  const city: string = storm?.city || '';
  const state: string = storm?.state || '';
  const eventType: string = storm?.event_type || 'Storm';
  const hailSize: string = storm?.hail_size_inches ? `${storm.hail_size_inches}"` : '';
  const eventDate: string = storm?.event_date
    ? new Date(storm.event_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
    : '';

  const seoTitle = hasStorm
    ? `Storm Damage Roof Repair in ${city} ${state} | Free Inspection | The Roof Docs`
    : `Free Roof Inspection in ${zip} | Storm Damage Experts | The Roof Docs`;
  const seoDesc = hasStorm
    ? `${eventType} damage reported in ${city}, ${state}. Get a free roof inspection from The Roof Docs — licensed, insured, insurance claim experts.`
    : `Schedule your free roof inspection in ${zip}. The Roof Docs serve VA, MD, and PA — licensed, insured, storm damage experts.`;

  const urgencyText = hasStorm
    ? `&#9888; Recent Storm Damage Reported in ${escHtml(city)}, ${escHtml(state)}`
    : `&#9888; Free Roof Inspections Available in ${escHtml(zip)}`;

  const heroTitle = hasStorm
    ? `Was Your Roof Damaged in the Recent <em>${escHtml(eventType)}</em>?`
    : `Schedule Your Free Roof Inspection in <em>${escHtml(zip)}</em>`;

  const heroSub = hasStorm
    ? `${hailSize ? `Hail up to ${escHtml(hailSize)} reported` : `Damage reported`}${eventDate ? ` on ${eventDate}` : ''}. Most homeowners qualify for a <strong>fully covered repair</strong> through insurance.`
    : `Our team serves VA, MD &amp; PA. We handle everything — from inspection to insurance claim to completed repair.`;

  const faqs = [
    {
      q: 'How do I know if my roof was damaged by the storm?',
      a: 'Common signs include missing or cracked shingles, granules in gutters, dents on metal flashing, and water stains inside your attic. Our inspectors identify all damage types, including hidden hail impacts invisible from the ground.',
    },
    {
      q: 'Will my insurance cover the roof repair?',
      a: 'Most standard homeowner policies cover storm damage including hail, wind, and falling debris. Coverage depends on your deductible, policy age, and the extent of damage. We work directly with your adjuster to maximize your claim.',
    },
    {
      q: 'How long do I have to file a storm damage claim?',
      a: 'Most insurers require claims to be filed within 1–3 years of the damage event, but the sooner you act the better. Delaying can result in secondary water damage — which may not be covered — and weakened claim evidence.',
    },
  ];

  return `${htmlHead(seoTitle, seoDesc)}
${navBar()}
<div class="urgency-banner" role="alert">${urgencyText}</div>

<main>
  <section class="hero">
    <div class="container">
      <div class="hero-eyebrow">Free Roof Inspection</div>
      <h1 class="hero-title">${heroTitle}</h1>
      <p class="hero-sub">${heroSub}</p>
    </div>
  </section>

  <section aria-label="Lead capture form">
    <div class="container">
      <div class="card">
        <h2 class="card-title">Get Your Free Inspection &mdash; No Cost, No Obligation</h2>
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
            <label class="form-label" for="damage_description">Describe the Damage You've Noticed</label>
            <textarea class="form-control" id="damage_description" name="damage_description" placeholder="e.g. Missing shingles on south side, granules in gutters, water stain in attic\u2026" rows="3"></textarea>
          </div>

          <button type="submit" class="btn-submit">Get My Free Inspection &rarr;</button>
          <p class="form-note">&#128274; Your information is private and will never be sold.</p>
        </form>
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
      <h2 class="faq-title">Storm Damage &amp; Insurance Claims &mdash; Your Questions Answered</h2>
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
${formScript('Get My Free Inspection →')}
${faqScript()}
${renderChatWidget()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page 2: Claim Help Quiz — /claim-help
// ---------------------------------------------------------------------------

function renderClaimHelpPage(): string {
  const title = 'Is Your Roof Damage Covered by Insurance? | Free Assessment | The Roof Docs';
  const desc = 'Answer 4 quick questions to find out if your roof damage is covered by your homeowner\'s insurance. Free inspection from The Roof Docs — VA, MD, PA.';

  return `${htmlHead(title, desc)}
${navBar()}

<main>
  <section class="hero" style="padding-bottom:0">
    <div class="container">
      <div class="hero-eyebrow">Free Insurance Assessment</div>
      <h1 class="hero-title">Is Your Roof Damage <em>Covered?</em></h1>
      <p class="hero-sub">Answer 4 quick questions to find out &mdash; takes under 60 seconds.</p>
    </div>
  </section>

  <section aria-label="Insurance claim quiz" style="padding:32px 0 48px">
    <div class="quiz-wrap">
      <div class="step-counter" id="step-counter" aria-live="polite">Step 1 of 5</div>
      <div class="progress-bar-wrap" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20" aria-label="Quiz progress">
        <div class="progress-bar-fill" id="progress-fill" style="width:20%"></div>
      </div>

      <!-- Step 1: When did damage occur? -->
      <div class="quiz-step active" id="step-1" role="group" aria-labelledby="q1-label">
        <h2 class="quiz-q" id="q1-label">When did the damage occur?</h2>
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
        <h2 class="quiz-q" id="q2-label">What type of damage do you have?</h2>
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
        <h2 class="quiz-q" id="q3-label">Do you have homeowner's insurance?</h2>
        <div class="radio-group">
          <button class="radio-opt" data-value="yes" onclick="selectOpt(this,3)">Yes, I have coverage</button>
          <button class="radio-opt" data-value="no" onclick="selectOpt(this,3)">No, I don't have insurance</button>
          <button class="radio-opt" data-value="not_sure" onclick="selectOpt(this,3)">Not sure / need to check</button>
        </div>
      </div>

      <!-- Step 4: Claim filed? -->
      <div class="quiz-step" id="step-4" role="group" aria-labelledby="q4-label">
        <h2 class="quiz-q" id="q4-label">Have you filed an insurance claim yet?</h2>
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
        <h2 class="quiz-q" id="quiz-result-headline">Great news! You likely qualify for a <em style="color:${BRAND.red}">FREE inspection.</em></h2>
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
                <input class="form-control" id="phone" name="phone" type="tel" placeholder="(703) 239-3738" required autocomplete="tel">
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
      b = 'A denial isn\'t final. Our team reviews adjuster reports and often recovers full coverage for our clients.';
    } else if(ins === 'no'){
      h = 'No insurance? We offer <em style="color:${BRAND.red}">affordable financing options.</em>';
      b = 'We work with homeowners in all situations. Our team will walk you through financing and any available assistance programs.';
    } else if(w === 'over6months'){
      h = 'Time may be <em style="color:${BRAND.red}">limited &mdash; act now.</em>';
      b = 'Claim windows vary by insurer. Let us inspect your roof before evidence degrades further and your options narrow.';
    } else {
      h = 'Great news! You likely qualify for a <em style="color:${BRAND.red}">FREE inspection.</em>';
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

  /* Form submit */
  var form = document.getElementById('lead-form');
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
        form.innerHTML = '<div class="success-box"><div class="success-icon">&#10003;</div><h2 class="success-title">You\'re All Set!</h2><p class="success-body">We\'ll contact you within 1 hour to schedule your free inspection.</p></div>';
      } else {
        alert(result.error || 'Submission failed. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Get My Free Assessment \u2192';
      }
    } catch(err){
      alert('Network error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Get My Free Assessment \u2192';
    }
  });
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page 3: Referral Landing — /refer/:code
// ---------------------------------------------------------------------------

function renderReferralPage(rep: Record<string, any> | null, code: string): string {
  const hasRep = !!rep;
  const repName: string = rep?.rep_name || '';
  const repTitle: string = rep?.rep_title || 'Roofing Specialist';
  const repPhone: string = rep?.rep_phone || '';
  const repImage: string = rep?.image_url || '';
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
    ? `${repName} at The Roof Docs was recommended to you. Schedule your free roof inspection today — serving VA, MD, and PA.`
    : 'Schedule your free roof inspection with The Roof Docs. Licensed and insured — VA, MD, PA.';

  const heroTitle = hasRep
    ? `<em>${escHtml(repName)}</em> was recommended to you`
    : 'Schedule Your <em>Free</em> Roof Inspection';

  const heroSub = hasRep
    ? `A neighbor trusted ${escHtml(repName)} to handle their roofing project. You can too &mdash; <strong>free inspection, no obligation.</strong>`
    : 'Our certified inspectors serve VA, MD &amp; PA. We handle storm damage, insurance claims, replacements, and repairs.';

  const repPhoneFormatted = repPhone
    ? `<a href="tel:${repPhone.replace(/\D/g, '')}" class="rep-phone">${escHtml(repPhone)}</a>`
    : '';

  const repCardHtml = hasRep
    ? `<div class="rep-card" aria-label="Your recommended representative">
        ${repImage
          ? `<img class="rep-avatar" src="${escHtml(repImage)}" alt="Photo of ${escHtml(repName)}" width="80" height="80" loading="eager">`
          : `<div class="rep-avatar-initials" aria-hidden="true">${escHtml(initials)}</div>`}
        <div class="rep-info">
          <div class="rep-name">${escHtml(repName)}</div>
          <div class="rep-title">${escHtml(repTitle)} &mdash; The Roof Docs</div>
          ${repPhoneFormatted}
        </div>
      </div>`
    : '';

  const services = [
    { value: '', label: 'Select a service\u2026' },
    { value: 'storm_damage', label: 'Storm Damage Inspection' },
    { value: 'roof_inspection', label: 'Free Roof Inspection' },
    { value: 'roof_replacement', label: 'Roof Replacement' },
    { value: 'roof_repair', label: 'Roof Repair' },
    { value: 'insurance_claim', label: 'Insurance Claim Assistance' },
    { value: 'gutters', label: 'Gutters' },
    { value: 'siding', label: 'Siding' },
    { value: 'other', label: 'Other / Not Sure' },
  ];

  return `${htmlHead(title, desc)}
${navBar(repPhone || undefined)}

<main>
  <section class="hero">
    <div class="container">
      <div class="hero-eyebrow">${hasRep ? 'Personal Referral' : 'Free Inspection'}</div>
      <h1 class="hero-title">${heroTitle}</h1>
      <p class="hero-sub">${heroSub}</p>
    </div>
  </section>

  <section aria-label="Referred representative and lead form">
    <div class="container">
      ${repCardHtml}

      <div class="card">
        <h2 class="card-title">Request Your Free Inspection</h2>
        <p class="card-subtitle">Fill out the form and ${hasRep ? escHtml(repName.split(' ')[0] || 'your rep') : 'our team'} will reach out within 1 hour.</p>

        <form id="lead-form" novalidate aria-label="Referral lead capture form">
          <input type="hidden" name="source" value="referral">
          <input type="hidden" name="referralCode" value="${escHtml(code)}">
          ${hasRep ? `<input type="hidden" name="repProfileId" value="${escHtml(String(rep?.profile_id ?? ''))}">` : ''}

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
    </div>
  </section>

  <section aria-label="Trust credentials">
    <div class="container-wide">
      ${trustBadges()}
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

function renderFreeInspectionPage(): string {
  const title = 'Free Roof Inspection | Licensed & Insured | The Roof Docs';
  const desc = 'Schedule your 100% free roof inspection with The Roof Docs. GAF Master Elite certified, A+ BBB rated. Serving Virginia, Maryland, and Pennsylvania.';

  const services = [
    { value: '', label: 'What brings you in today?\u2026' },
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

  const faqs = [
    {
      q: 'Is the inspection really free?',
      a: 'Yes — 100% free with no obligation. We inspect your roof, document any damage with photos, and give you a detailed report. No pressure, no strings attached.',
    },
    {
      q: 'How long does an inspection take?',
      a: 'A typical inspection takes 30–45 minutes. We examine the roof surface, flashing, gutters, ventilation, and attic (when accessible). You\'ll receive your report the same day.',
    },
    {
      q: 'What if you find damage?',
      a: 'We walk you through exactly what we found, explain your options, and help determine if your homeowner\'s insurance may cover the repairs. We handle the entire claims process at no extra cost to you.',
    },
    {
      q: 'Are you licensed and insured?',
      a: 'Absolutely. We\'re licensed in Virginia (#2705194709), Maryland (MHIC #164697), and Pennsylvania (#145926). We\'re also a GAF Master Elite contractor — a distinction held by only 2% of roofers nationwide.',
    },
    {
      q: 'What areas do you serve?',
      a: 'We serve Virginia, Maryland, and Pennsylvania — including the greater Washington D.C. metro area, Northern Virginia, Baltimore metro, and surrounding counties.',
    },
  ];

  const whyUs = [
    { icon: '&#127942;', title: 'GAF Master Elite', desc: 'Top 2% of roofers nationwide' },
    { icon: '&#128170;', title: '25-Year Warranty', desc: 'Industry-leading Golden Pledge coverage' },
    { icon: '&#128176;', title: '100% Free', desc: 'No cost, no obligation inspection' },
    { icon: '&#9201;', title: '1-Hour Response', desc: 'We call you back within 60 minutes' },
  ];

  return `${htmlHead(title, desc, 'https://sa21.up.railway.app/free-inspection')}
${navBar()}
<div class="urgency-banner" role="alert">&#128293; Limited Availability &mdash; Book Your Free Inspection Today</div>

<main>
  <section class="hero">
    <div class="container">
      <div class="hero-eyebrow">100% Free &bull; No Obligation</div>
      <h1 class="hero-title">Get Your <em>Free Roof Inspection</em> Today</h1>
      <p class="hero-sub">Licensed, insured, and trusted by thousands of homeowners across VA, MD &amp; PA. We'll inspect your roof, document everything, and give you an honest assessment &mdash; at no cost.</p>
    </div>
  </section>

  <!-- Why Choose Us -->
  <section aria-label="Why choose The Roof Docs" style="padding:0 0 32px">
    <div class="container-wide">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${whyUs.map(item => `
        <div style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;padding:20px 16px;text-align:center">
          <div style="font-size:28px;margin-bottom:8px">${item.icon}</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${item.title}</div>
          <div style="font-size:12px;color:${BRAND.textMuted}">${item.desc}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>
  <style>@media(max-width:640px){[style*="grid-template-columns:repeat(4"]{grid-template-columns:repeat(2,1fr) !important}}</style>

  <!-- Lead Capture Form -->
  <section aria-label="Lead capture form">
    <div class="container">
      <div class="card">
        <h2 class="card-title">Schedule Your Free Inspection</h2>
        <p class="card-subtitle">Fill out the form below and we'll contact you within 1 hour.</p>

        <form id="lead-form" novalidate aria-label="Free inspection request form">
          <input type="hidden" name="source" value="claim_help">

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
            <textarea class="form-control" id="message" name="message" placeholder="e.g. I noticed missing shingles after the last storm, or my roof is 20+ years old\u2026" rows="3"></textarea>
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
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerLeadGenPages(app: Application, pool: Pool): void {

  // ── Page 1: Storm Landing ────────────────────────────────────────────────
  app.get('/storm/:zip', async (req, res) => {
    const { zip } = req.params;

    // Basic ZIP validation — accept 5-digit US ZIPs only
    if (!/^\d{5}$/.test(zip)) {
      res.status(400).set('Content-Type', 'text/html').send(
        renderStormPage(null, zip.slice(0, 10))
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
    res.set('Cache-Control', 'public, max-age=300'); // 5-min cache — data changes infrequently
    res.send(renderStormPage(storm, zip));
  });

  // ── Page 2: Claim Help Quiz ───────────────────────────────────────────────
  app.get('/claim-help', (_req, res) => {
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'public, max-age=3600'); // static page, 1hr cache
    res.send(renderClaimHelpPage());
  });

  // ── Page 4: Free Inspection ──────────────────────────────────────────────
  app.get('/free-inspection', (_req, res) => {
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(renderFreeInspectionPage());
  });

  // ── Page 3: Referral Landing ─────────────────────────────────────────────
  app.get('/refer/:code', async (req, res) => {
    const { code } = req.params;

    // Sanitise: only alphanumeric + hyphen, max 64 chars
    const safeCode = code.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);

    let rep: Record<string, any> | null = null;
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
        rep = result.rows[0] ?? null;
      } catch (err) {
        // Table may not exist yet — graceful fallback
        console.error('[leadGenPages] referral_codes query failed:', err);
      }
    }

    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(renderReferralPage(rep, safeCode));
  });

  // ── Page 5: Storm Checklist Lead Magnet ─────────────────────────────────
  app.get('/storm-checklist', (_req, res) => {
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(renderStormChecklistPage());
  });
}


// ---------------------------------------------------------------------------
// Page 5 Renderer: Storm Damage Claim Checklist (lead magnet)
// ---------------------------------------------------------------------------

function renderStormChecklistPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Free Storm Damage Checklist | The Roof Docs</title>
  <meta name="description" content="Download our free Storm Damage Insurance Claim Checklist. Know exactly what to do after a storm hits your roof — step by step.">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      background:${BRAND.bg};color:#fff;line-height:1.6}
    .container{max-width:640px;margin:0 auto;padding:24px 16px}
    .hero{text-align:center;padding:48px 0 32px}
    .hero h1{font-size:28px;font-weight:800;margin-bottom:12px;line-height:1.2}
    .hero .accent{color:${BRAND.red}}
    .hero p{color:${BRAND.textMuted};font-size:16px;max-width:480px;margin:0 auto}
    .preview{background:${BRAND.card};border:1px solid ${BRAND.border};
      border-radius:16px;padding:28px;margin:24px 0}
    .preview h2{font-size:18px;margin-bottom:16px;color:${BRAND.red}}
    .checklist-item{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid ${BRAND.border}}
    .checklist-item:last-child{border-bottom:none}
    .check{color:${BRAND.red};font-size:18px;flex-shrink:0;margin-top:2px}
    .checklist-item h3{font-size:14px;font-weight:600;margin-bottom:2px}
    .checklist-item p{font-size:13px;color:${BRAND.textMuted}}
    .gate{background:linear-gradient(135deg,${BRAND.darkBlue},#0f3d6b);
      border:1px solid rgba(182,8,7,0.3);border-radius:16px;padding:28px;margin:24px 0;text-align:center}
    .gate h2{font-size:20px;margin-bottom:8px}
    .gate p{color:${BRAND.textMuted};font-size:14px;margin-bottom:20px}
    .gate form{display:flex;flex-direction:column;gap:12px;max-width:360px;margin:0 auto}
    .gate input{padding:14px 16px;border-radius:10px;border:1px solid ${BRAND.border};
      background:rgba(0,0,0,0.3);color:#fff;font-size:15px}
    .gate input::placeholder{color:${BRAND.textDim}}
    .gate button{padding:16px;border:none;border-radius:10px;background:${BRAND.red};
      color:#fff;font-size:16px;font-weight:700;cursor:pointer;transition:background 0.2s}
    .gate button:hover{background:${BRAND.redHover}}
    .bonus{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}
    .bonus-item{flex:1;min-width:140px;background:${BRAND.card};border:1px solid ${BRAND.border};
      border-radius:12px;padding:16px;text-align:center}
    .bonus-item .icon{font-size:28px;margin-bottom:6px}
    .bonus-item h3{font-size:13px;font-weight:600;margin-bottom:4px}
    .bonus-item p{font-size:12px;color:${BRAND.textMuted}}
    .testimonial{background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;
      padding:20px;margin:16px 0;font-style:italic;color:${BRAND.textMuted};font-size:14px}
    .testimonial .attr{color:#fff;font-style:normal;font-weight:600;margin-top:8px;font-size:13px}
    .footer{text-align:center;padding:32px 0;color:${BRAND.textDim};font-size:12px}
    .success-msg{display:none;text-align:center;padding:32px;background:rgba(34,197,94,0.1);
      border:1px solid rgba(34,197,94,0.3);border-radius:16px;margin:24px 0}
    .success-msg h2{color:#22c55e;margin-bottom:8px}
    .success-msg p{color:${BRAND.textMuted}}
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <h1>Your <span class="accent">Storm Damage</span><br>Insurance Claim Checklist</h1>
      <p>The step-by-step guide Maryland & Virginia homeowners use to maximize their insurance claim after storm damage.</p>
    </div>

    <div class="preview">
      <h2>What's Inside (Preview)</h2>
      <div class="checklist-item">
        <span class="check">&#10003;</span>
        <div><h3>Immediate Safety Steps</h3><p>What to do in the first 24 hours after a storm</p></div>
      </div>
      <div class="checklist-item">
        <span class="check">&#10003;</span>
        <div><h3>Document Everything</h3><p>Exactly what photos and videos your adjuster needs to see</p></div>
      </div>
      <div class="checklist-item">
        <span class="check">&#10003;</span>
        <div><h3>Filing Timeline</h3><p>Critical deadlines that most homeowners miss (and lose money)</p></div>
      </div>
      <div class="checklist-item">
        <span class="check">&#10003;</span>
        <div><h3>Adjuster Meeting Prep</h3><p>Questions to ask and red flags to watch for</p></div>
      </div>
      <div class="checklist-item">
        <span class="check">&#10003;</span>
        <div><h3>Supplement Request Template</h3><p>Get the full amount you're owed — word-for-word script</p></div>
      </div>
      <div class="checklist-item">
        <span class="check">&#10003;</span>
        <div><h3>Contractor Vetting Checklist</h3><p>7 things to verify before signing anything</p></div>
      </div>
    </div>

    <div class="bonus">
      <div class="bonus-item">
        <div class="icon">&#128196;</div>
        <h3>10-Page Guide</h3>
        <p>Printable PDF</p>
      </div>
      <div class="bonus-item">
        <div class="icon">&#9989;</div>
        <h3>Fillable Fields</h3>
        <p>Track your progress</p>
      </div>
      <div class="bonus-item">
        <div class="icon">&#128176;</div>
        <h3>100% Free</h3>
        <p>No strings attached</p>
      </div>
    </div>

    <div class="testimonial">
      "I didn't know I could supplement my claim until I read this checklist. Ended up getting $4,200 more than the initial estimate."
      <div class="attr">— Sarah M., Columbia MD</div>
    </div>

    <div class="gate" id="gate-form">
      <h2>Get Your Free Checklist</h2>
      <p>Enter your email and we'll send the full checklist instantly.</p>
      <form id="checklist-form" onsubmit="submitChecklist(event)">
        <input type="text" name="name" placeholder="Your name" required>
        <input type="email" name="email" placeholder="Your email" required>
        <input type="tel" name="phone" placeholder="Phone (optional)">
        <input type="text" name="zip" placeholder="ZIP code (optional)">
        <button type="submit">Send Me the Checklist</button>
      </form>
      <p style="font-size:11px;color:${BRAND.textDim};margin-top:12px">
        We respect your privacy. No spam — just the checklist and occasional storm alerts for your area.
      </p>
    </div>

    <div class="success-msg" id="success-msg">
      <h2>&#10003; Check Your Email!</h2>
      <p>Your Storm Damage Claim Checklist is on its way.<br>
      Check your inbox (and spam folder) in the next 2 minutes.</p>
      <p style="margin-top:16px">
        <strong>Want a free roof inspection too?</strong><br>
        <a href="/free-inspection" style="color:${BRAND.red};text-decoration:none;font-weight:600">
          Schedule Your Free Inspection &rarr;
        </a>
      </p>
    </div>

    <div class="testimonial">
      "After the hail storm hit Ellicott City, this checklist walked me through everything. My contractor even said I was the most prepared homeowner he'd worked with."
      <div class="attr">— James T., Ellicott City MD</div>
    </div>

    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} The Roof Docs &bull; GAF Elite Certified</p>
      <p style="margin-top:4px">Serving Maryland, Virginia & the DMV area</p>
    </div>
  </div>

  <script>
    function submitChecklist(e) {
      e.preventDefault();
      var form = e.target;
      var btn = form.querySelector('button');
      btn.textContent = 'Sending...';
      btn.disabled = true;

      var data = {
        homeownerName: form.name.value.trim(),
        homeownerEmail: form.email.value.trim(),
        homeownerPhone: form.phone.value.trim() || undefined,
        zipCode: form.zip.value.trim() || undefined,
        source: 'claim_help',
        serviceType: 'storm_damage',
        message: 'Lead magnet: Storm Damage Insurance Claim Checklist download'
      };

      fetch('/api/leads/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result.success) {
          document.getElementById('gate-form').style.display = 'none';
          document.getElementById('success-msg').style.display = 'block';
        } else {
          btn.textContent = 'Try Again';
          btn.disabled = false;
        }
      })
      .catch(function() {
        btn.textContent = 'Try Again';
        btn.disabled = false;
      });
    }
  </script>
${renderChatWidget()}
</body>
</html>`;
}
