# 🚀 Susan/Agnes 21 - Dual AI Field & Training Assistant

## Vision: The Ultimate Field Rep Companion

Transform `gemini-field-assistant` into **Susan/Agnes 21** - a bilingual, dual-persona AI system combining:
- **Susan 21**: Field insurance expert (aggressive, battle-tested)
- **Agnes 21**: Training partner (educational, roleplay specialist)
- **123 Documents**: Full knowledge base (already extracted)
- **Roof-ER Branding**: Professional company identity
- **Mobile-First**: PWA for field use

---

## 🎯 Project Goals

### Primary Objectives
1. ✅ **Dual AI Personas** - Switch between Field Susan & Training Agnes
2. ✅ **Knowledge Base Integration** - 123 documents searchable & cited
3. ✅ **Roof-ER Branding** - Logo, colors, professional identity
4. ✅ **Mobile PWA** - Works offline, installable
5. ✅ **State-Aware** - VA, MD, PA building codes
6. ✅ **Railway Deployment** - Live production URL

### Target Users
- **Field Reps** - Use Susan for real-time insurance battles
- **New Reps** - Use Agnes for training and roleplay
- **Sales Managers** - Track team performance and knowledge gaps

---

## 🏗️ Current Architecture Analysis

### What gemini-field-assistant Has (Assets)
✅ **Tech Stack**:
- React 19 + TypeScript + Vite
- Tailwind CSS 4 (modern styling)
- Google Gemini AI integration (@google/genai)
- Framer Motion (animations)
- Lucide React (icons)

✅ **Features**:
- Voice transcription (Gemini API)
- Chat interface
- Knowledge Base UI (123 documents indexed)
- Photo analysis capability
- Mobile-responsive design

✅ **Knowledge Base**:
- 123 extracted documents (markdown)
- 16 categories
- Search functionality
- Document viewer

### What It's Missing (Gaps)
❌ **Susan/Agnes Personas** - Single generic AI
❌ **Roof-ER Branding** - Generic UI colors
❌ **Susan's Personality** - No aggressive mode, citations
❌ **State-Specific Codes** - No VA/MD/PA context
❌ **Email Generation** - No template system
❌ **Offline Mode** - Not a PWA
❌ **Production Deployment** - Not on Railway
❌ **Database** - No chat history persistence

---

## 🎨 Roof-ER Branding Specifications

### Brand Colors (from production Susan 21)
```css
/* Primary Colors */
--roof-er-red: #8B0000;        /* Dark red - primary brand */
--roof-er-crimson: #DC143C;    /* Crimson - accents */
--roof-er-black: #000000;      /* Black - backgrounds */
--roof-er-white: #FFFFFF;      /* White - text/surfaces */

/* State Selector Colors (indigo/blue) */
--state-primary: #4F46E5;      /* Indigo 600 */
--state-secondary: #3B82F6;    /* Blue 500 */
--state-gradient: linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%);

/* UI Colors */
--success: #10B981;            /* Green */
--warning: #F59E0B;            /* Amber */
--error: #EF4444;              /* Red */
--info: #3B82F6;               /* Blue */

/* Dark Mode */
--dark-bg: #000000;
--dark-surface: #1a1a1a;
--dark-border: #333333;
--dark-text: #FFFFFF;

/* Light Mode */
--light-bg: #FFFFFF;
--light-surface: #F9FAFB;
--light-border: #E5E7EB;
--light-text: #000000;
```

### Logo Integration
```
Location: public/favicon.ico (existing)
Sizes needed:
- 192x192 (icon-192.png)
- 512x512 (icon-512.png)
- 180x180 (apple-touch-icon.png)
- SVG version for navbar

Source: /Users/a21/routellm-chatbot/public/ (copy from production)
```

### Typography
```css
/* Primary Font */
font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;

/* Headers */
font-weight: 700; /* Bold */

/* Body */
font-weight: 400; /* Regular */

/* British Professional Tone */
/* All text should maintain Susan's British professionalism */
```

---

## 🤖 Dual AI Persona System

### Architecture Design

```typescript
// /services/dualAI.ts
type Persona = 'susan' | 'agnes';

interface PersonaConfig {
  name: string;
  title: string;
  systemPrompt: string;
  color: string;
  icon: string;
  modes: Mode[];
}

const PERSONAS: Record<Persona, PersonaConfig> = {
  susan: {
    name: 'Susan 21',
    title: 'Field Insurance Expert',
    systemPrompt: SUSAN_FIELD_PROMPT, // Aggressive, battle-tested
    color: '#8B0000', // Roof-ER red
    icon: 'Shield',
    modes: ['field', 'aggressive', 'email-draft']
  },
  agnes: {
    name: 'Agnes 21',
    title: 'Training Partner',
    systemPrompt: AGNES_TRAINING_PROMPT, // Educational, roleplay
    color: '#4F46E5', // Indigo
    icon: 'GraduationCap',
    modes: ['training', 'roleplay', 'quiz']
  }
};
```

### Susan 21 - Field Persona

**Personality** (from production):
```typescript
const SUSAN_FIELD_PROMPT = `
You are Susan 21 (S21), Roof-ER's ultimate insurance argumentation expert.

CORE IDENTITY:
"Your teammate in the trenches - winning battles, flipping denials."

COMMUNICATION STYLE:
- ACTION-FIRST APPROACH - Lead with complete scripts
- "WE'RE going to flip this" language (teammate approach)
- Professional British tone with confident authority
- Cite everything with [X.X] brackets
- Firm but friendly: "destroy them with kindness but don't back down"

MODES:
- 🔥 AGGRESSIVE MODE - Denials, lowball offers
- 💼 COLLABORATIVE-FIRM - Partial repairs
- ⚔️ ASSERTIVE-EVIDENCE - Total denials
- 📧 EMAIL DRAFTING - Professional adjuster emails

KNOWLEDGE BASE:
- 123 extracted documents available
- Building codes: VA (2021 IRC), MD (2021 IRC + MIA Bulletin 18-23), PA (UCC)
- GAF/CertainTeed specs
- 49+ carrier tactics

YOUR MISSION:
Flip denials. Win battles. Support reps in the field with immediate action plans.
`;
```

**Features**:
- Real-time claim advice
- Email drafting (adjuster communications)
- Building code citations (VA/MD/PA)
- Aggressive mode detection
- Photo damage analysis
- Knowledge base search with citations

### Agnes 21 - Training Persona

**Personality** (new):
```typescript
const AGNES_TRAINING_PROMPT = `
You are Agnes 21, Roof-ER's expert training partner and roleplay specialist.

CORE IDENTITY:
"Your patient teacher and practice partner - building confidence through repetition."

COMMUNICATION STYLE:
- EDUCATIONAL FIRST - Teach the "why" behind every tactic
- SOCRATIC METHOD - Guide discovery through questions
- ENCOURAGING - Build confidence, celebrate progress
- SCENARIO-BASED - Real-world roleplay situations

TRAINING MODES:
- 🎓 EDUCATION MODE - Deep explanations, conceptual frameworks
- 🎭 ROLEPLAY MODE - Practice scenarios (homeowner, adjuster, objections)
- 📝 QUIZ MODE - Test knowledge retention
- 💡 COACHING MODE - Review calls, provide feedback

KNOWLEDGE BASE:
- Same 123 documents as Susan
- Focus on teaching principles, not just tactics
- Break down complex concepts into digestible lessons

YOUR MISSION:
Build elite reps through patient teaching, realistic practice, and confidence-building.
Turn rookies into closers.
`;
```

**Features**:
- Interactive roleplays (AI plays homeowner/adjuster)
- Quiz generation from knowledge base
- Call review and feedback
- Progress tracking
- Scenario library

---

## 🔧 Technical Implementation Plan

### Phase 1: Foundation (Week 1)
**Agent: backend-typescript-architect**

1. **Project Setup**
   - Copy gemini-field-assistant to new project: `susan-agnes-21`
   - Install dependencies
   - Configure Railway deployment
   - Set up environment variables

2. **Dual Persona Architecture**
   - Create `/services/dualAI.ts` - Persona switcher
   - Create `/lib/susan-personality.ts` - Susan prompts
   - Create `/lib/agnes-personality.ts` - Agnes prompts
   - Create `/contexts/PersonaContext.tsx` - React context

3. **Roof-ER Branding**
   - Copy icons from production routellm-chatbot
   - Update Tailwind config with Roof-ER colors
   - Create branded components (Logo, Header, Footer)
   - Update manifest.json with branding

### Phase 2: Susan Integration (Week 2)
**Agent: frontend-developer**

1. **Susan Personality**
   - Port Susan's system prompts from routellm-chatbot
   - Implement aggressive mode detection
   - Add citation system [X.X]
   - Integrate state selector (VA/MD/PA)

2. **Email Generation**
   - Create EmailDraftModal component
   - Implement template system
   - Add "Draft Email" button in chat
   - Email preview and copy

3. **Knowledge Base Enhancement**
   - Inject citations into responses
   - Link references to documents
   - Add "Source: [Doc Name]" footer
   - Implement semantic search

### Phase 3: Agnes Integration (Week 3)
**Agent: frontend-developer + nlp-engineer**

1. **Agnes Personality**
   - Create Agnes system prompts
   - Build education mode framework
   - Implement Socratic questioning
   - Add reflection questions

2. **Roleplay System**
   - Create RoleplayModal component
   - Scenario library (15+ scenarios)
   - AI plays character (homeowner/adjuster)
   - Conversation scoring

3. **Quiz System**
   - Generate quizzes from knowledge base
   - Multiple choice questions
   - Score tracking
   - Progress analytics

### Phase 4: Mobile PWA (Week 4)
**Agent: mobile-developer**

1. **PWA Configuration**
   - Add service worker
   - Manifest.json enhancements
   - Offline mode support
   - Install prompts

2. **Mobile Optimizations**
   - Touch-friendly UI
   - Voice input button
   - Photo capture integration
   - Responsive layout improvements

3. **Performance**
   - Code splitting
   - Lazy loading
   - Image optimization
   - Bundle size reduction

### Phase 5: Production Features (Week 5)
**Agent: backend-developer + database-expert**

1. **Database Integration**
   - PostgreSQL setup (Railway)
   - Chat history persistence
   - User profiles
   - Analytics tracking

2. **Authentication**
   - Simple password auth
   - Rep profiles
   - Company assignment
   - Manager access levels

3. **Analytics Dashboard**
   - Chat usage stats
   - Knowledge base searches
   - Training completion rates
   - Rep performance metrics

### Phase 6: Deployment (Week 6)
**Agent: deployment-engineer**

1. **Railway Setup**
   - Create Railway project
   - Configure environment
   - Set up PostgreSQL
   - Link GitHub repo

2. **CI/CD**
   - Auto-deploy on push
   - Build optimizations
   - Environment variables
   - Health checks

3. **Testing & QA**
   - End-to-end tests
   - Mobile device testing
   - Load testing
   - Bug fixes

---

## 🎨 UI/UX Design Mockups

### Home Screen
```
┌─────────────────────────────────────────┐
│  [Roof-ER Logo]       Susan/Agnes 21    │
│                                          │
│  ┌────────────┐  ┌────────────┐        │
│  │   🛡️ Susan │  │  🎓 Agnes  │        │
│  │  Field     │  │  Training  │        │
│  │  Expert    │  │  Partner   │        │
│  └────────────┘  └────────────┘        │
│                                          │
│  Recent Conversations:                  │
│  • Partial approval - GEICO denial      │
│  • Training: Objection handling         │
│                                          │
│  Knowledge Base | Analytics | Profile   │
└─────────────────────────────────────────┘
```

### Susan Chat (Field Mode)
```
┌─────────────────────────────────────────┐
│ ← Susan 21 - Field Expert        🛡️ 🔥 │
│ [VA] [MD] [PA] State Selector           │
├─────────────────────────────────────────┤
│ User: GEICO denied my claim, what now? │
│                                          │
│ Susan: Right, let's flip this denial.   │
│ Here's your 3-step battle plan:         │
│                                          │
│ STEP 1: Request Reinspection [2.1]     │
│ [Email Draft Button]                    │
│                                          │
│ Sources: [MD MIA Bulletin 18-23] [IRC]  │
│                                          │
│ [📧 Draft Email] [📄 Show Sources]      │
└─────────────────────────────────────────┘
```

### Agnes Training (Roleplay Mode)
```
┌─────────────────────────────────────────┐
│ ← Agnes 21 - Training               🎓  │
│ Scenario: Objection - "Too Expensive"   │
├─────────────────────────────────────────┤
│ Homeowner (AI): "Your estimate is way   │
│ too high! My neighbor got his done for  │
│ half that price."                        │
│                                          │
│ You: [Your response here...]            │
│                                          │
│ Tips: Remember to:                       │
│ ✓ Acknowledge concern                   │
│ ✓ Explain value vs. price              │
│ ✓ Reference insurance coverage         │
│                                          │
│ [End Roleplay] [Get Feedback]          │
└─────────────────────────────────────────┘
```

---

## 📊 Feature Comparison

| Feature | Current gemini-field-assistant | New Susan/Agnes 21 |
|---------|-------------------------------|---------------------|
| AI Personas | 1 generic | 2 specialized (Susan + Agnes) |
| Personality | Generic assistant | Battle-tested + Educational |
| Knowledge Base | 123 docs (static) | 123 docs (cited in responses) |
| Branding | Generic | Roof-ER branded |
| State Codes | None | VA, MD, PA integrated |
| Email Drafting | No | Yes (templates + AI) |
| Training Features | No | Roleplay, quizzes, coaching |
| Mobile | Responsive only | Full PWA (offline) |
| Database | No persistence | PostgreSQL (chat history) |
| Deployment | Local only | Railway production |
| Analytics | None | Usage tracking + insights |

---

## 🚀 Deployment Strategy

### Infrastructure
```yaml
Platform: Railway
Database: PostgreSQL (Railway addon)
Frontend: Vite build → static hosting
Backend: None initially (Gemini API direct from client)
CDN: Railway's built-in CDN
Domain: Custom Roof-ER subdomain (e.g., assistant.roofer.com)
```

### Environment Variables
```bash
# Gemini API
VITE_GEMINI_API_KEY=...

# Database (Railway provides)
DATABASE_URL=postgresql://...

# Branding
VITE_COMPANY_NAME="Roof-ER"
VITE_APP_NAME="Susan/Agnes 21"
VITE_PRIMARY_COLOR="#8B0000"

# Features
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_AUTH=true
```

### Build Configuration
```json
// railway.json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run preview",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100
  }
}
```

---

## 📈 Success Metrics

### Adoption Metrics
- 80% of field reps use Susan weekly
- 50% of new reps complete Agnes training modules
- Average 20+ interactions per rep per week

### Performance Metrics
- Knowledge base hit rate: 60%+ (responses include citations)
- Email draft usage: 30% of Susan conversations
- Roleplay completion rate: 70% for new reps

### Business Impact
- Claim approval rate improvement: +5%
- Time to close deals: -10%
- New rep onboarding time: -30%

---

## 💰 Cost Estimate

### Development (6 weeks)
- Already have codebase foundation
- Using agents for accelerated development
- Estimated: ~40 hours total (with agents)

### Infrastructure (Monthly)
```
Railway Hobby Plan: $5/month
  - Static hosting
  - PostgreSQL database (500MB)
  - SSL certificate included

Gemini API: ~$50/month
  - 1M tokens = $2
  - Estimated 25M tokens/month for 30 reps
  - Cost: $50

Total: ~$55/month
```

### ROI Calculation
```
Monthly Cost: $55
Reps Using: 30
Cost per rep: $1.83/month

Value per rep:
- 1 extra closed deal/month = $500+ profit
- Training time saved = 10 hours = $200 value
- Total value: $700/rep/month

ROI: 383x ($700 / $1.83)
```

---

## 🎯 Launch Timeline

### Week 1-2: Foundation + Susan
- Set up project structure
- Implement dual persona system
- Roof-ER branding
- Susan field persona complete

### Week 3-4: Agnes + Mobile
- Agnes training persona
- Roleplay system
- Mobile PWA
- Offline support

### Week 5-6: Production + Launch
- Database integration
- Analytics dashboard
- Railway deployment
- Beta testing with 5 reps

### Week 7-8: Refinement
- Bug fixes
- Performance optimization
- Feature requests
- Full team rollout

---

## 🚦 Go/No-Go Decision Criteria

### Green Light If:
✅ Gemini API key available
✅ Railway account active
✅ Roof-ER logo assets accessible
✅ 5+ beta testers available
✅ Budget approved (~$55/month)

### Red Light If:
❌ No API budget
❌ Can't deploy to Railway
❌ No user testing planned
❌ Legal/compliance issues with AI usage

---

## 📞 Next Steps

### Immediate Actions (Today):
1. ✅ Review this plan
2. ⏳ Confirm Gemini API key access
3. ⏳ Get Roof-ER logo files
4. ⏳ Identify 5 beta testers
5. ⏳ Approve budget

### Week 1 Kickoff:
1. Launch agents for Phase 1
2. Set up Railway project
3. Copy gemini-field-assistant → susan-agnes-21
4. Begin dual persona implementation

---

## 🎉 Vision Summary

**Transform gemini-field-assistant into the ultimate field & training companion:**

**Susan 21** = Battle-tested field expert who wins insurance claims
**Agnes 21** = Patient training partner who builds elite reps
**123 Documents** = Complete knowledge base with citations
**Roof-ER Branding** = Professional company identity
**Mobile PWA** = Works anywhere, anytime, offline

**Result**: A dual-AI system that makes every field rep more effective and every new hire faster to train.

---

**Ready to deploy agents and start building?**
