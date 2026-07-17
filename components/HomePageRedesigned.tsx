import React, { useEffect, useState } from 'react';
import { useDivision } from '../contexts/DivisionContext';
import {
  MessageSquare,
  Mail,
  ChevronRight,
  Sun,
  Moon,
  CloudSun,
  CloudRain,
  CloudSnow,
  Cloud,
  Wind,
  ThumbsUp,
  AlertTriangle,
  User,
  Globe,
  FileText,
  Flame,
  Lightbulb,
  BookOpen,
  RefreshCw
} from 'lucide-react';
import { authService } from '../services/authService';

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'live' | 'knowledge' | 'admin' | 'agnes' | 'agnes-learning' | 'translator' | 'documentjob' | 'team' | 'learning' | 'canvassing' | 'impacted' | 'territories' | 'stormmap' | 'leaderboard' | 'contests' | 'myprofile' | 'inspections' | 'notifications';

interface HomePageRedesignedProps {
  setActivePanel: (panel: PanelType) => void;
  userEmail?: string;
}

// Weather-based motivational quotes
const WEATHER_QUOTES: Record<string, { insurance: string[]; retail: string[] }> = {
  sunny: {
    insurance: [
      "Clear skies today — perfect for roof inspections. Get up there.",
      "Sun's out. Homeowners are outside. Time to knock.",
      "Beautiful day to document damage and build your pipeline.",
    ],
    retail: [
      "Perfect weather for door-knocking. Everyone's in a good mood.",
      "Sun's out, people are outside — easiest conversations happen today.",
      "Great day to be in the field. Let's set some appointments.",
    ]
  },
  cloudy: {
    insurance: [
      "Overcast skies remind homeowners about their roof. Use it.",
      "Cloud cover today — good for inspections without the glare.",
      "Gray sky? Homeowners are thinking about weather. Perfect timing.",
    ],
    retail: [
      "Overcast but comfortable — ideal knocking weather.",
      "Cloudy days keep homeowners inside. They'll answer the door.",
      "Not too hot, not too cold. Get those doors knocked.",
    ]
  },
  rainy: {
    insurance: [
      "Rain today = leak calls tomorrow. Be ready.",
      "Rainy days are research days. Prep your supplements and follow-ups.",
      "Can't knock? Sharpen your emails and call your pipeline.",
    ],
    retail: [
      "Rain means homeowners are HOME. Dial, text, follow up.",
      "Can't knock doors? Practice with Agnes 24. Get sharper.",
      "Rainy day = training day. Hit Agnes, review your scripts, come back stronger.",
    ]
  },
  stormy: {
    insurance: [
      "Storm activity detected. Check Storm Maps NOW — be first.",
      "Storms = opportunity. Document everything. Get to those doors first.",
      "New storm data incoming. Your next claim could be today.",
    ],
    retail: [
      "Storms today — stay safe. Tomorrow's gonna be a busy one.",
      "Bad weather today means homeowners thinking about their home tomorrow.",
      "Storm day = prep day. Review your product knowledge and come out swinging.",
    ]
  },
  cold: {
    insurance: [
      "Cold out there. Warm up with some emails and Susan time.",
      "Bundle up if you're inspecting today. Safety first.",
      "Cold weather = drafty windows = opportunity for your pipeline.",
    ],
    retail: [
      "Cold day — lead with windows. 'Have you noticed any drafts?'",
      "When it's cold, homeowners FEEL their old windows. Perfect pitch day.",
      "Bundle up and knock. The cold is your best visual cue for windows.",
    ]
  },
  hot: {
    insurance: [
      "Hot one today. Hydrate and inspect smart.",
      "AC running hard? So are your homeowners' bills. Solar pitch?",
      "Hot days show shingle wear fast. Great for documentation.",
    ],
    retail: [
      "Hot day — lead with energy savings. Windows, insulation, solar.",
      "'Has your AC been running nonstop?' — easiest opener on a hot day.",
      "Hydrate between doors. The heat is your opening for energy efficiency.",
    ]
  }
};

interface WeatherData {
  temp: number;
  condition: string;
  description: string;
  icon: React.ComponentType<any>;
}

// Daily motivation pool — rotates by day, tap to cycle (max 5 refreshes/day)
const MOTIVATION_POOL = [
  "Every door you don't knock is a yes you'll never hear.",
  "The rep who follows up wins the job the first visit started.",
  "Storms don't schedule appointments. Neither should your hustle wait.",
  "You're not selling roofs. You're protecting families from the next storm.",
  "One more door. That's the whole secret.",
  "Adjusters respect reps who show up with documentation, not opinions.",
  "Your pipeline is built on the days you didn't feel like knocking.",
  "Be so thorough the insurance company can't say no.",
  "The best time to canvass was after the storm. The second best time is now.",
  "Homeowners don't remember the pitch. They remember who showed up.",
  "Slow day? That's what separates the pros from the seasonal guys.",
  "Every 'no' is data. Every 'yes' is momentum. Both move you forward.",
  "Your next referral is watching how you handle this job.",
  "Win the morning: first door by 10, first conversation by 10:05.",
  "Claims get approved on evidence. Bring receipts, not vibes.",
  "The roof doesn't lie. Document what's there and let it talk.",
];

// General field tips by division — rotates daily, tap to cycle
const FIELD_TIPS: Record<'insurance' | 'retail', string[]> = {
  insurance: [
    "Hail divots fill with water, freeze, and expand — that's why 'minor' damage becomes leaks. Use this with hesitant homeowners.",
    "Frame it for adjusters: 'Code-compliant repair requires…' beats 'we think it needs…' every time.",
    "Photograph every slope, even clean ones. Proving what's NOT damaged builds credibility for what is.",
    "Were you home for the storm? — the single best door opener after weather hits.",
    "Think of yourself like a lawyer: the damage is evidence, the claim is the case.",
    "Get the brittleness test on camera. A failed repair attempt is your strongest argument in VA and PA.",
    "Always ask who their carrier is early — it shapes every argument you'll make.",
  ],
  retail: [
    "Point at the neighbor's project: 'We're doing the Johnsons' place up the street' beats any script.",
    "'Afternoons or evenings better for you?' — always give two yeses, never a yes/no.",
    "'Not interested' → 'Totally fair — we do windows, siding, doors and solar too. What's next on your list?'",
    "Hot day? Lead with energy savings. Cold day? Lead with drafts. The weather is your co-pitch.",
    "My job is simple: get your name, find a time that works, leave a flyer. Low pressure sets appointments.",
    "'Have a guy'? Great — a second quote keeps him honest. No harm in options.",
    "Both decision-makers at the appointment = half the cancellations.",
  ],
};

const HomePageRedesigned: React.FC<HomePageRedesignedProps> = ({ setActivePanel, userEmail }) => {
  const { isRetail } = useDivision();
  const user = authService.getCurrentUser();
  const isAdmin = user?.role === 'admin';
  const [recentChats, setRecentChats] = useState<Array<{ text: string }>>([]);
  const [topIntel, setTopIntel] = useState<string | null>(null);
  const [stormSummary, setStormSummary] = useState<{ count: number; maxMagnitude: number | null } | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [summaries, setSummaries] = useState<Array<{ summary: string; topics: string[]; action_items: string[] }>>([]);
  const [playbook, setPlaybook] = useState<string[]>([]);
  const [playbookIdx, setPlaybookIdx] = useState(0);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const [tipIdx, setTipIdx] = useState(dayOfYear);
  const [motdIdx, setMotdIdx] = useState(() => {
    const saved = parseInt(localStorage.getItem('susan_motd_idx') || '', 10);
    return Number.isFinite(saved) ? saved : dayOfYear;
  });

  const todayKey = new Date().toISOString().slice(0, 10);
  const motdRefreshesUsed = parseInt(localStorage.getItem(`susan_motd_count_${todayKey}`) || '0', 10);
  const cycleMotivation = () => {
    if (motdRefreshesUsed >= 5) return;
    const next = motdIdx + 1;
    setMotdIdx(next);
    localStorage.setItem('susan_motd_idx', String(next));
    localStorage.setItem(`susan_motd_count_${todayKey}`, String(motdRefreshesUsed + 1));
  };

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.name?.split(' ')[0] || 'there';
    if (hour < 12) return { text: `Good morning, ${name}`, icon: Sun };
    if (hour < 17) return { text: `Good afternoon, ${name}`, icon: CloudSun };
    return { text: `Good evening, ${name}`, icon: Moon };
  };

  // Get weather-based quote
  const getWeatherQuote = (condition: string) => {
    const pool = WEATHER_QUOTES[condition] || WEATHER_QUOTES.sunny;
    const quotes = isRetail ? pool.retail : pool.insurance;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return quotes[dayOfYear % quotes.length];
  };

  // Fetch weather from NWS (free, no key needed)
  useEffect(() => {
    const state = user?.state || 'VA';
    // NWS observation stations by state
    const stations: Record<string, string> = {
      VA: 'KDCA', // Reagan National (DC/NoVA)
      MD: 'KBWI', // Baltimore
      PA: 'KPHL', // Philadelphia
    };
    const station = stations[state] || 'KDCA';

    fetch(`https://api.weather.gov/stations/${station}/observations/latest`, {
      headers: { 'User-Agent': 'Susan21-RoofER/1.0 (admin@roofer.com)' }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.properties) return;
        const props = data.properties;
        const tempC = props.temperature?.value;
        const tempF = tempC != null ? Math.round(tempC * 9 / 5 + 32) : null;
        const desc = props.textDescription || '';
        const descLower = desc.toLowerCase();

        let condition = 'sunny';
        let icon: React.ComponentType<any> = Sun;

        if (descLower.includes('thunder') || descLower.includes('storm')) {
          condition = 'stormy'; icon = AlertTriangle;
        } else if (descLower.includes('rain') || descLower.includes('drizzle') || descLower.includes('shower')) {
          condition = 'rainy'; icon = CloudRain;
        } else if (descLower.includes('snow') || descLower.includes('ice') || descLower.includes('sleet')) {
          condition = 'cold'; icon = CloudSnow;
        } else if (descLower.includes('cloud') || descLower.includes('overcast') || descLower.includes('fog')) {
          condition = 'cloudy'; icon = Cloud;
        } else if (descLower.includes('wind')) {
          condition = 'cloudy'; icon = Wind;
        } else if (tempF != null && tempF < 40) {
          condition = 'cold'; icon = CloudSnow;
        } else if (tempF != null && tempF > 85) {
          condition = 'hot'; icon = Sun;
        }

        setWeather({
          temp: tempF || 0,
          condition,
          description: desc || 'Clear',
          icon
        });
      })
      .catch(() => {});
  }, [user?.state]);

  // Load recent chats
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chatHistory');
      if (raw) {
        const msgs = JSON.parse(raw) as Array<{ text: string; sender: string }>;
        const userMsgs = msgs
          .filter(m => m.sender === 'user' && m.text.length > 10)
          .slice(-3)
          .reverse()
          .map(m => ({ text: m.text.length > 70 ? m.text.substring(0, 70) + '...' : m.text }));
        setRecentChats(userMsgs);
      }
    } catch { /* ignore */ }
  }, []);

  // Load storm summary + top intel
  useEffect(() => {
    if (!isRetail && userEmail) {
      fetch('/api/dashboard/storm-summary', { headers: { 'x-user-email': userEmail } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setStormSummary(d); })
        .catch(() => {});
    }

    fetch('/api/agent-network?limit=1', { headers: { 'x-user-email': userEmail || '' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d) && d.length > 0 && d[0].content) {
          setTopIntel(d[0].content.length > 120 ? d[0].content.substring(0, 120) + '...' : d[0].content);
        }
      })
      .catch(() => {});
  }, [userEmail, isRetail]);

  // Susan board: rep's recent conversation summaries + company playbook
  useEffect(() => {
    if (!userEmail) return;
    const headers = { 'x-user-email': userEmail };
    const parseArr = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      if (typeof v === 'string') { try { return JSON.parse(v) || []; } catch { return []; } }
      return [];
    };

    fetch('/api/memory/summaries?limit=3', { headers })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        if (!Array.isArray(rows)) return;
        setSummaries(rows.filter((r: any) => r?.summary).map((r: any) => ({
          summary: String(r.summary),
          topics: parseArr(r.topics),
          action_items: parseArr(r.action_items),
        })));
      })
      .catch(() => {});

    fetch('/api/learning/global?limit=6', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const learnings = Array.isArray(d?.learnings) ? d.learnings : [];
        setPlaybook(learnings.map((l: any) => String(l.content)).filter(Boolean));
      })
      .catch(() => {});
  }, [userEmail]);

  const greeting = getGreeting();
  const weatherQuote = weather ? getWeatherQuote(weather.condition) : null;
  const hasRecentStorms = !isRetail && stormSummary && stormSummary.count > 0;

  // Quick Actions — unified 4-tile launcher for all reps (retail + insurance).
  // Profile · Pocket Linguist · Email · Upload & Analyze.
  const quickActions = [
    { id: 'myprofile', title: 'Profile', description: 'QR code & settings', icon: User, accent: '#8b5cf6', accentSoft: 'rgba(139,92,246,0.45)', accentGlow: 'rgba(139,92,246,0.14)' },
    { id: 'translator', title: 'Pocket Linguist', description: 'Translate + close deals', icon: Globe, accent: '#10b981', accentSoft: 'rgba(16,185,129,0.45)', accentGlow: 'rgba(16,185,129,0.14)' },
    { id: 'email', title: 'Email', description: 'Generate emails', icon: Mail, accent: '#dc2626', accentSoft: 'rgba(220,38,38,0.45)', accentGlow: 'rgba(220,38,38,0.14)' },
    { id: 'image', title: 'Upload & Analyze', description: 'Docs, photos & claims', icon: FileText, accent: '#f59e0b', accentSoft: 'rgba(245,158,11,0.45)', accentGlow: 'rgba(245,158,11,0.14)' },
  ];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      // transparent so the layered content-area background (glow + dot grid) shows
      background: 'transparent',
      position: 'relative',
      zIndex: 1,
    }}>
      {/* Greeting + Weather */}
      <div style={{
        padding: 'max(1.25rem, env(safe-area-inset-top, 1.25rem)) 1rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(1.35rem, 5vw, 1.75rem)', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
            {greeting.text}
          </h1>
          <div className={`ember-rule${isRetail ? ' ember-rule--retail' : ''}`} />
        </div>
      </div>

      <div style={{ padding: '0 1rem 1.5rem' }}>

        {/* Weather Quote or Storm Alert (storm banner is admin-only; reps don't see Storm Maps) */}
        {hasRecentStorms && isAdmin ? (
          <div
            onClick={() => setActivePanel('stormmap')}
            style={{
              background: 'rgba(139,92,246,0.1)',
              border: '1px solid rgba(139,92,246,0.25)',
              borderRadius: '14px',
              padding: '0.875rem 1rem',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <AlertTriangle style={{ width: '20px', height: '20px', color: '#a78bfa', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {stormSummary!.count} storm event{stormSummary!.count > 1 ? 's' : ''} this month
                {stormSummary!.maxMagnitude && stormSummary!.maxMagnitude > 0 ? ` — up to ${stormSummary!.maxMagnitude}" hail` : ''}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Tap to view Storm Maps</div>
            </div>
            <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)' }} />
          </div>
        ) : null}

        {/* ===== Susan's Board — 6 cards: history, playbook, tips, fire, weather ===== */}
        {(() => {
          type BoardCard = {
            id: string;
            eyebrow: string;
            accent: string;
            glow: string;
            icon: React.ComponentType<any>;
            body: string;
            detail?: string;
            actionLabel?: string;
            onAction?: () => void;
            onCycle?: () => void;
            cycleDisabled?: boolean;
          };

          const tips = FIELD_TIPS[isRetail ? 'retail' : 'insurance'];
          const cards: BoardCard[] = [];

          // Fallback while server summaries are still sparse: local chat history
          if (summaries.length === 0 && recentChats.length > 0) {
            cards.push({
              id: 'history-local',
              eyebrow: 'FROM YOUR RECENT CHATS',
              accent: '#dc2626', glow: 'rgba(220,38,38,0.14)',
              icon: MessageSquare,
              body: recentChats[0].text,
              detail: recentChats[1]?.text,
              actionLabel: 'Continue with Susan',
              onAction: () => setActivePanel('chat'),
            });
          }

          // 1–2: the rep's own recent conversations with Susan
          summaries.slice(0, 2).forEach((s, i) => {
            cards.push({
              id: `history-${i}`,
              eyebrow: i === 0 ? 'PICK UP WHERE WE LEFT OFF' : 'FROM YOUR RECENT CHATS',
              accent: '#dc2626', glow: 'rgba(220,38,38,0.14)',
              icon: MessageSquare,
              body: s.summary,
              detail: s.action_items[0]
                ? `Still open: ${s.action_items[0]}`
                : (s.topics[0] ? `Topic: ${s.topics[0]}` : undefined),
              actionLabel: 'Continue with Susan',
              onAction: () => setActivePanel('chat'),
            });
          });

          // Top team tip (peer intel)
          if (topIntel) {
            cards.push({
              id: 'intel',
              eyebrow: 'TOP TEAM TIP',
              accent: '#10b981', glow: 'rgba(16,185,129,0.14)',
              icon: ThumbsUp,
              body: topIntel,
              actionLabel: 'Ask Susan about it',
              onAction: () => setActivePanel('chat'),
            });
          }

          // Company playbook (admin-approved universal learnings)
          if (playbook.length > 0) {
            cards.push({
              id: 'playbook',
              eyebrow: 'COMPANY PLAYBOOK',
              accent: '#8b5cf6', glow: 'rgba(139,92,246,0.14)',
              icon: BookOpen,
              body: playbook[playbookIdx % playbook.length],
              onCycle: playbook.length > 1 ? () => setPlaybookIdx(i => i + 1) : undefined,
            });
          }

          // General field tip — rotates daily, tap to cycle. Sits in the flex
          // pool: it yields its seat when personalized content fills the board.
          cards.push({
            id: 'tip',
            eyebrow: 'FIELD TIP',
            accent: '#3b82f6', glow: 'rgba(59,130,246,0.14)',
            icon: Lightbulb,
            body: tips[tipIdx % tips.length],
            onCycle: () => setTipIdx(i => i + 1),
          });

          // Daily fire + weather always get a seat
          const required: BoardCard[] = [{
            id: 'motd',
            eyebrow: 'DAILY FIRE',
            accent: '#f59e0b', glow: 'rgba(245,158,11,0.14)',
            icon: Flame,
            body: MOTIVATION_POOL[motdIdx % MOTIVATION_POOL.length],
            onCycle: cycleMotivation,
            cycleDisabled: motdRefreshesUsed >= 5,
          }];
          if (weather) {
            required.push({
              id: 'weather',
              eyebrow: "TODAY'S CONDITIONS",
              accent: '#38bdf8', glow: 'rgba(56,189,248,0.14)',
              icon: weather.icon,
              body: `${weather.temp}° — ${weather.description}`,
              detail: weatherQuote || undefined,
            });
          }

          const board = [...cards.slice(0, 6 - required.length), ...required];

          // Backfill with extra field tips so the board always shows 6
          let fillIdx = 1;
          while (board.length < 6 && fillIdx < tips.length) {
            board.push({
              id: `tip-fill-${fillIdx}`,
              eyebrow: 'FIELD TIP',
              accent: '#3b82f6', glow: 'rgba(59,130,246,0.14)',
              icon: Lightbulb,
              body: tips[(tipIdx + fillIdx) % tips.length],
            });
            fillIdx++;
          }

          return (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-disabled)', letterSpacing: '0.12em', marginBottom: '8px', paddingLeft: '2px' }}>
                SUSAN'S BOARD
              </div>
              <div className="susan-board">
                {board.map(card => {
                  const CardIcon = card.icon;
                  const isExpanded = expandedCard === card.id;
                  return (
                    <div
                      key={card.id}
                      className={`sb-card${isExpanded ? ' sb-card--expanded' : ''}`}
                      style={{
                        '--qa-accent': card.accent,
                        '--qa-accent-soft': card.accent + '73',
                        '--qa-accent-glow': card.glow,
                      } as React.CSSProperties}
                      onClick={() => setExpandedCard(isExpanded ? null : card.id)}
                    >
                      <div className="sb-card-head">
                        <span className="qa-tile-icon" style={{ width: '28px', height: '28px', borderRadius: '8px' }}>
                          <CardIcon />
                        </span>
                        <span className="sb-card-eyebrow" style={{ color: card.accent }}>{card.eyebrow}</span>
                        {card.onCycle && (
                          <button
                            className="sb-card-cycle"
                            title={card.cycleDisabled ? 'Come back tomorrow for more' : 'Show me another'}
                            disabled={card.cycleDisabled}
                            onClick={(e) => { e.stopPropagation(); card.onCycle!(); }}
                          >
                            <RefreshCw />
                          </button>
                        )}
                      </div>
                      <div className={`sb-card-body${isExpanded ? '' : ' sb-card-body--clamped'}`}>
                        {card.body}
                      </div>
                      {(isExpanded || card.id === 'weather') && card.detail && (
                        <div className="sb-card-detail">{card.detail}</div>
                      )}
                      {isExpanded && card.onAction && (
                        <button
                          className="sb-card-action"
                          onClick={(e) => { e.stopPropagation(); card.onAction!(); }}
                        >
                          {card.actionLabel} <ChevronRight />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Quick Actions — now at the bottom */}
        <div style={{ marginTop: '0.25rem' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-disabled)', letterSpacing: '0.12em', marginBottom: '8px', paddingLeft: '2px' }}>
            QUICK ACTIONS
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.6rem',
          }}>
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => setActivePanel(action.id as PanelType)}
                  className="qa-tile"
                  style={{
                    '--qa-accent': action.accent,
                    '--qa-accent-soft': action.accentSoft,
                    '--qa-accent-glow': action.accentGlow,
                  } as React.CSSProperties}
                >
                  <span className="qa-tile-icon"><Icon /></span>
                  <div>
                    <div className="qa-tile-title">{action.title}</div>
                    <div className="qa-tile-desc">{action.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePageRedesigned;
