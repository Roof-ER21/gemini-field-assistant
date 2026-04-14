import React, { useEffect, useState } from 'react';
import { useDivision } from '../contexts/DivisionContext';
import {
  MessageSquare,
  Image,
  Mail,
  Building2,
  Briefcase,
  Target,
  TrendingUp,
  Trophy,
  ChevronRight,
  Sparkles,
  Sun,
  Moon,
  CloudSun,
  CloudRain,
  CloudSnow,
  Cloud,
  Wind,
  ThumbsUp,
  AlertTriangle
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

// Daily tips pool
const INSURANCE_TIPS = [
  "Always search Susan's knowledge base before an adjuster meeting — she has scripts for every scenario.",
  "Use the 'Select State' quick action before generating emails. VA, MD, and PA have very different building code arguments.",
  "Post your wins in Team Intel. When you upvote tips, Susan literally gets smarter for everyone.",
  "After a storm, check Storm Maps immediately. NOAA data + SPC reports = your strongest argument.",
  "The compliance checker in Email Gen catches language that could get you in trouble. Use it every time.",
  "Maryland R908.3 requires full tear-off — no overlays. Susan knows this. Ask her before your next MD claim.",
  "Agnes 21 scores you out of 100. Practice until you hit 80+ consistently.",
  "Upload supplements and denials to Susan — she reads them and tells you exactly how to respond.",
  "Don't say 'insurance will cover it.' Say 'as the licensed contractor, I'm required to install per current code.'",
  "The best time to check Storm Maps is right after a weather alert. Be the first one knocking.",
];

const RETAIL_TIPS = [
  "Always start with the ice breaker. 'Hello, how are you?' then 'You look ___, I'll be quick.'",
  "Practice the 7 Stop Signs with Agnes 24 until the rebuttals feel natural.",
  "Point at a neighbor's house when you say 'we're doing work down the street.' Physical pointing creates social proof.",
  "The Broomstick Theory: take two steps back after knocking. Give space = earn respect.",
  "Always pivot. If they don't need windows, ask about the roof. Never leave after one no.",
  "The utility bill ask is a micro-commitment. When they go find it, they've invested in the appointment.",
  "'Sound fair?' is your best friend. It gets a verbal yes without feeling like a close.",
  "Susan 24 knows all 9 products. Between doors, ask her for a quick product refresh.",
  "Know your minimums: 4+ windows, 75% siding, 15+ year roof, south-facing for solar.",
  "End every interaction positively — even if they say no. You're the person they'll remember.",
];

interface WeatherData {
  temp: number;
  condition: string;
  description: string;
  icon: React.ComponentType<any>;
}

const HomePageRedesigned: React.FC<HomePageRedesignedProps> = ({ setActivePanel, userEmail }) => {
  const { isRetail } = useDivision();
  const user = authService.getCurrentUser();
  const [recentChats, setRecentChats] = useState<Array<{ text: string }>>([]);
  const [topIntel, setTopIntel] = useState<string | null>(null);
  const [stormSummary, setStormSummary] = useState<{ count: number; maxMagnitude: number | null } | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.name?.split(' ')[0] || 'there';
    if (hour < 12) return { text: `Good morning, ${name}`, icon: Sun };
    if (hour < 17) return { text: `Good afternoon, ${name}`, icon: CloudSun };
    return { text: `Good evening, ${name}`, icon: Moon };
  };

  // Get daily tip
  const getDailyTip = () => {
    const tips = isRetail ? RETAIL_TIPS : INSURANCE_TIPS;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return tips[dayOfYear % tips.length];
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

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;
  const dailyTip = getDailyTip();
  const WeatherIcon = weather?.icon || Cloud;
  const weatherQuote = weather ? getWeatherQuote(weather.condition) : null;
  const hasRecentStorms = !isRetail && stormSummary && stormSummary.count > 0;

  // Quick Actions
  const insuranceQuickActions = [
    { id: 'stormmap', title: 'Storm Maps', description: 'Hail history & radar', icon: Building2, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
    { id: 'email', title: 'Generate Email', description: 'Templates + compliance', icon: Mail, gradient: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' },
    { id: 'image', title: 'Upload & Analyze', description: 'Docs, photos & claims', icon: Image, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
    { id: 'chat', title: 'Susan 21', description: 'AI assistant', icon: MessageSquare, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
    { id: 'myprofile', title: 'QR Profile', description: 'Share your landing page', icon: Target, gradient: 'linear-gradient(135deg, #52525b 0%, #3f3f46 100%)' },
    { id: 'translator', title: 'Pocket Linguist', description: 'Translate + close deals', icon: Sparkles, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  ];

  const retailQuickActions = [
    { id: 'chat', title: 'Susan 24', description: 'Pitch coaching & product info', icon: MessageSquare, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
    { id: 'agnes-learning', title: 'Agnes 24', description: 'Practice your pitch', icon: Sparkles, gradient: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)' },
    { id: 'knowledge', title: 'Knowledge Base', description: 'Scripts, products & rebuttals', icon: Briefcase, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
    { id: 'team', title: 'Team Chat', description: 'Message colleagues', icon: TrendingUp, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
    { id: 'translator', title: 'Pocket Linguist', description: 'Translate + close deals', icon: Target, gradient: 'linear-gradient(135deg, #52525b 0%, #3f3f46 100%)' },
    { id: 'myprofile', title: 'Profile', description: 'Your settings', icon: Trophy, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
  ];

  const quickActions = isRetail ? retailQuickActions : insuranceQuickActions;
  const accent = isRetail ? '#3b82f6' : '#dc2626';
  const accentFaint = isRetail ? 'rgba(59,130,246,' : 'rgba(220,38,38,';

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--bg-primary)',
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
          <h1 style={{ fontSize: 'clamp(1.25rem, 5vw, 1.6rem)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
            {greeting.text}
          </h1>
        </div>

        {/* Weather pill */}
        {weather && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '20px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}>
            <WeatherIcon style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{weather.temp}°</span>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {weather.description}
            </span>
          </div>
        )}
      </div>

      <div style={{ padding: '0 1rem 1.5rem' }}>

        {/* Weather Quote or Storm Alert */}
        {hasRecentStorms ? (
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
                {stormSummary!.maxMagnitude ? ` — up to ${stormSummary!.maxMagnitude}" hail` : ''}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Tap to view Storm Maps</div>
            </div>
            <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)' }} />
          </div>
        ) : weatherQuote ? (
          <div style={{
            background: `${accentFaint}0.06)`,
            border: `1px solid ${accentFaint}0.15)`,
            borderRadius: '14px',
            padding: '0.875rem 1rem',
            marginBottom: '0.75rem',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}>
            <WeatherIcon style={{ width: '16px', height: '16px', color: accent, flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
              {weatherQuote}
            </div>
          </div>
        ) : null}

        {/* Daily Tip */}
        <div style={{
          background: `${accentFaint}0.08)`,
          border: `1px solid ${accentFaint}0.2)`,
          borderRadius: '14px',
          padding: '0.875rem 1rem',
          marginBottom: '0.75rem',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <Sparkles style={{ width: '16px', height: '16px', color: accent, flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: accent, letterSpacing: '0.12em', marginBottom: '3px' }}>
              TIP OF THE DAY
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {dailyTip}
            </div>
          </div>
        </div>

        {/* Recent Conversations */}
        {recentChats.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-disabled)', letterSpacing: '0.12em', marginBottom: '6px', paddingLeft: '2px' }}>
              RECENT CONVERSATIONS
            </div>
            {recentChats.map((chat, i) => (
              <div
                key={i}
                onClick={() => setActivePanel('chat')}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '0.7rem 0.875rem',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <MessageSquare style={{ width: '14px', height: '14px', color: 'var(--text-disabled)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chat.text}
                </div>
                <ChevronRight style={{ width: '12px', height: '12px', color: 'var(--text-disabled)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )}

        {/* Top Team Intel */}
        {topIntel && (
          <div
            onClick={() => setActivePanel('knowledge')}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '14px',
              padding: '0.875rem 1rem',
              marginBottom: '0.75rem',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <ThumbsUp style={{ width: '14px', height: '14px', color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', letterSpacing: '0.12em', marginBottom: '3px' }}>
                TOP TEAM TIP
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {topIntel}
              </div>
            </div>
            <ChevronRight style={{ width: '12px', height: '12px', color: 'var(--text-disabled)', flexShrink: 0, marginTop: '2px' }} />
          </div>
        )}

        {/* Quick Actions */}
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
                  style={{
                    background: action.gradient,
                    border: 'none',
                    borderRadius: '12px',
                    padding: '0.875rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    minHeight: '80px',
                  }}
                >
                  <Icon style={{ width: '1.25rem', height: '1.25rem', color: 'rgba(255,255,255,0.9)' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', lineHeight: 1.2 }}>
                      {action.title}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                      {action.description}
                    </div>
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
