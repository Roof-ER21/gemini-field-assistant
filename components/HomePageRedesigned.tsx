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
  Zap,
  Sparkles,
  Sun,
  Moon,
  CloudSun,
  Clock,
  ThumbsUp
} from 'lucide-react';
import { authService } from '../services/authService';

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'live' | 'knowledge' | 'admin' | 'agnes' | 'agnes-learning' | 'translator' | 'documentjob' | 'team' | 'learning' | 'canvassing' | 'impacted' | 'territories' | 'stormmap' | 'leaderboard' | 'contests' | 'myprofile' | 'inspections' | 'notifications';

interface HomePageRedesignedProps {
  setActivePanel: (panel: PanelType) => void;
  userEmail?: string;
}

// Daily tips pool
const INSURANCE_TIPS = [
  "Always search Susan's knowledge base before an adjuster meeting — she has scripts for every scenario.",
  "Use the 'Select State' quick action before generating emails. VA, MD, and PA have very different building code arguments.",
  "Post your wins in Team Intel. When you upvote tips, Susan literally gets smarter for everyone.",
  "After a storm, check Storm Maps immediately. NOAA data + SPC reports = your strongest argument.",
  "The compliance checker in Email Gen catches language that could get you in trouble. Use it every time.",
  "Maryland R908.3 requires full tear-off — no overlays. Susan knows this. Ask her before your next MD claim.",
  "Agnes 21 scores you out of 100. Practice until you hit 80+ consistently before going door-to-door.",
  "Upload supplements and denials to Susan — she reads them and tells you exactly how to respond.",
  "Don't say 'insurance will cover it.' Say 'as the licensed contractor, I'm required to install per current code.' Susan has the scripts.",
  "The best time to check Storm Maps is right after a weather alert. Be the first one knocking.",
];

const RETAIL_TIPS = [
  "Always start with the ice breaker. 'Hello, how are you?' then 'You look ___, I'll be quick.' It sets the tone.",
  "Practice the 7 Stop Signs with Agnes 24 until the rebuttals feel natural. You should never hesitate at the door.",
  "Point at a neighbor's house when you say 'we're doing work down the street.' Physical pointing creates social proof.",
  "The Broomstick Theory: take two steps back after knocking. Give space = earn respect.",
  "Always pivot. If they don't need windows, ask about the roof. If not the roof, ask about siding. Never leave after one no.",
  "The utility bill ask is a micro-commitment. When they go find it, they've invested in the appointment.",
  "'Sound fair?' is your best friend. It gets a verbal yes without feeling like a close.",
  "Susan 24 knows all 9 products cold. Between doors, ask her 'give me the windows value script' for a quick refresh.",
  "Know your minimums: 4+ windows, 75% siding coverage, 15+ year roof, south-facing for solar. Don't set bad appointments.",
  "End every interaction positively — even if they say no. You're the person they'll remember when they're ready.",
];

const HomePageRedesigned: React.FC<HomePageRedesignedProps> = ({ setActivePanel, userEmail }) => {
  const { isRetail } = useDivision();
  const user = authService.getCurrentUser();
  const [recentChats, setRecentChats] = useState<Array<{ text: string; time: string }>>([]);
  const [topIntel, setTopIntel] = useState<string | null>(null);
  const [stormCount, setStormCount] = useState<number>(0);

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.name?.split(' ')[0] || 'there';
    if (hour < 12) return { text: `Good morning, ${name}`, icon: Sun, sub: "Let's make today count." };
    if (hour < 17) return { text: `Good afternoon, ${name}`, icon: CloudSun, sub: isRetail ? "Time to hit the doors." : "Time to close some claims." };
    return { text: `Good evening, ${name}`, icon: Moon, sub: "Wrapping up strong." };
  };

  // Get today's tip (rotates daily based on day of year)
  const getDailyTip = () => {
    const tips = isRetail ? RETAIL_TIPS : INSURANCE_TIPS;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return tips[dayOfYear % tips.length];
  };

  // Load recent chats from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chatHistory');
      if (raw) {
        const msgs = JSON.parse(raw) as Array<{ text: string; sender: string; id: string }>;
        const userMsgs = msgs
          .filter(m => m.sender === 'user' && m.text.length > 10)
          .slice(-3)
          .reverse()
          .map(m => ({
            text: m.text.length > 80 ? m.text.substring(0, 80) + '...' : m.text,
            time: 'Recent'
          }));
        setRecentChats(userMsgs);
      }
    } catch { /* ignore */ }
  }, []);

  // Load storm count + top intel (graceful if backend unavailable)
  useEffect(() => {
    if (!isRetail && userEmail) {
      fetch('/api/storm-alerts/recent-count', { headers: { 'x-user-email': userEmail } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.count) setStormCount(d.count); })
        .catch(() => {});
    }

    fetch('/api/agent-intel?limit=1&sort=helpful', { headers: { 'x-user-email': userEmail || '' } })
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

  const cardStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '14px',
    padding: '1rem 1.25rem',
    marginBottom: '0.75rem',
    cursor: 'pointer' as const,
    transition: 'all 0.2s',
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--bg-primary)',
      padding: '0',
      boxSizing: 'border-box'
    }}>
      {/* Greeting */}
      <div style={{
        padding: '2rem 1.5rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          background: isRetail ? 'rgba(59,130,246,0.15)' : 'rgba(220,38,38,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <GreetingIcon style={{ width: '24px', height: '24px', color: isRetail ? '#60a5fa' : '#f87171' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
            {greeting.text}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
            {greeting.sub}
          </p>
        </div>
      </div>

      <div style={{ padding: '0 1rem 1rem' }}>

        {/* Daily Tip */}
        <div
          style={{
            ...cardStyle,
            cursor: 'default',
            background: isRetail ? 'rgba(59,130,246,0.08)' : 'rgba(220,38,38,0.08)',
            border: `1px solid ${isRetail ? 'rgba(59,130,246,0.2)' : 'rgba(220,38,38,0.2)'}`,
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}
        >
          <Sparkles style={{ width: '18px', height: '18px', color: isRetail ? '#60a5fa' : '#f87171', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: isRetail ? '#60a5fa' : '#f87171', letterSpacing: '0.1em', marginBottom: '4px' }}>
              TIP OF THE DAY
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {dailyTip}
            </div>
          </div>
        </div>

        {/* Storm Alert Banner (insurance only) */}
        {!isRetail && stormCount > 0 && (
          <div
            onClick={() => setActivePanel('stormmap')}
            style={{
              ...cardStyle,
              background: 'rgba(139,92,246,0.1)',
              border: '1px solid rgba(139,92,246,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Building2 style={{ width: '20px', height: '20px', color: '#a78bfa', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {stormCount} storm event{stormCount > 1 ? 's' : ''} in the last 30 days
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Tap to view Storm Maps</div>
            </div>
            <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)' }} />
          </div>
        )}

        {/* Recent Conversations */}
        {recentChats.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', marginBottom: '8px', paddingLeft: '4px' }}>
              RECENT CONVERSATIONS
            </div>
            {recentChats.map((chat, i) => (
              <div
                key={i}
                onClick={() => setActivePanel('chat')}
                style={{
                  ...cardStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <MessageSquare style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chat.text}
                </div>
                <ChevronRight style={{ width: '14px', height: '14px', color: 'var(--text-disabled)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )}

        {/* Top Team Intel */}
        {topIntel && (
          <div
            onClick={() => setActivePanel('knowledge')}
            style={{
              ...cardStyle,
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <ThumbsUp style={{ width: '16px', height: '16px', color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', letterSpacing: '0.1em', marginBottom: '4px' }}>
                TOP TEAM TIP
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {topIntel}
              </div>
            </div>
            <ChevronRight style={{ width: '14px', height: '14px', color: 'var(--text-disabled)', flexShrink: 0, marginTop: '2px' }} />
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', marginBottom: '10px', paddingLeft: '4px' }}>
            QUICK ACTIONS
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
            gap: '0.75rem'
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
                    padding: '1rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                  }}
                >
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(10px)',
                    padding: '0.6rem',
                    borderRadius: '10px'
                  }}>
                    <Icon style={{ width: '1.25rem', height: '1.25rem', color: '#ffffff' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.15rem' }}>
                      {action.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                      {action.description}
                    </div>
                  </div>
                  <ChevronRight style={{ width: '1rem', height: '1rem', color: 'rgba(255, 255, 255, 0.7)' }} />
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
