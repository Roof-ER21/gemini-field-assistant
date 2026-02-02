import React, { useMemo, useState } from 'react';
import { Headphones, Play, Sparkles, Users, History, ChevronDown, ChevronUp, Calendar, Clock, Award, Target, Share2 } from 'lucide-react';
import PitchTrainer from '../agnes21/components/PitchTrainer';
import { PitchMode, DifficultyLevel, SessionConfig } from '../agnes21/types';
import { getScriptsByDivision, getScriptById, PhoneScript } from '../agnes21/utils/phoneScripts';
import { AgnesAuthProvider, useAuth } from '../agnes21/contexts/AuthContext';
import { getSessions, getSessionStats, SessionData } from '../agnes21/utils/sessionStorage';
import { roofService } from '../services/roofService';

// Interface for admin-created scripts
interface AdminScript {
  id: string;
  name: string;
  category: 'door-knock' | 'objection' | 'closing' | 'adjuster' | 'custom';
  content: string;
  createdAt: string;
  updatedAt: string;
}

const AgnesLearningContent: React.FC = () => {
  const { user } = useAuth();
  const builtInScripts = useMemo(() => getScriptsByDivision('insurance'), []);

  // Load admin-created scripts from localStorage
  const adminScripts = useMemo(() => {
    try {
      const stored = localStorage.getItem('agnes_admin_scripts');
      if (stored) {
        const parsed: AdminScript[] = JSON.parse(stored);
        // Convert admin scripts to PhoneScript format
        return parsed.map(s => ({
          id: `admin_${s.id}`,
          title: s.name,
          category: s.category as PhoneScript['category'],
          division: 'insurance' as const,
          content: s.content,
          isAdmin: true // Flag to identify admin scripts
        }));
      }
    } catch (e) {
      console.error('Failed to load admin scripts:', e);
    }
    return [];
  }, []);

  // Combine built-in and admin scripts
  const scripts = useMemo(() => [...builtInScripts, ...adminScripts], [builtInScripts, adminScripts]);

  const [activeTrack, setActiveTrack] = useState<'roleplay' | 'feedback' | 'listen'>('roleplay');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(DifficultyLevel.ROOKIE);
  const [scriptId, setScriptId] = useState<string>(builtInScripts[0]?.id || '');
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<SessionConfig | null>(null);
  const [showMySessionsModal, setShowMySessionsModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
  const [sharingSessionId, setSharingSessionId] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const missingClientKey = !import.meta.env.VITE_GEMINI_API_KEY && !import.meta.env.VITE_GOOGLE_AI_API_KEY;

  // Find script by ID - check both built-in and admin scripts
  const selectedScript = useMemo(() => {
    // First try built-in scripts
    const builtIn = getScriptById(scriptId);
    if (builtIn) return builtIn;
    // Then check admin scripts
    return adminScripts.find(s => s.id === scriptId) || null;
  }, [scriptId, adminScripts]);

  const scriptContent = useCustomScript ? customScript : (selectedScript?.content || '');
  const groupedScripts = useMemo(() => {
    const groups: Record<string, (PhoneScript & { isAdmin?: boolean })[]> = {};
    const labelFor = (script: PhoneScript & { isAdmin?: boolean }) => {
      // Admin scripts get their own category
      if (script.isAdmin) return '⭐ Admin Scripts';
      if (script.category === 'door-to-door' || script.category === 'authorization') return 'Door-to-Door';
      if (script.category === 'estimate') return 'Estimate Calls';
      if (script.category === 'pushback' || script.category === 'objection') return 'Insurance Pushback';
      return 'Other';
    };
    scripts.forEach(script => {
      const label = labelFor(script);
      if (!groups[label]) groups[label] = [];
      groups[label].push(script);
    });
    return groups;
  }, [scripts]);

  const handleScriptChange = (value: string) => {
    if (value === '__custom__') {
      setUseCustomScript(true);
      return;
    }
    setUseCustomScript(false);
    setScriptId(value);
  };

  const trackOptions = [
    {
      key: 'roleplay' as const,
      mode: PitchMode.ROLEPLAY,
      label: 'Roleplay (Live Homeowner)',
      description: 'Real homeowner simulation with objections and live reactions.',
      icon: Users
    },
    {
      key: 'feedback' as const,
      mode: PitchMode.COACH,
      label: 'Feedback (Coach Mode)',
      description: 'Agnes coaches you, pauses, and corrects mid‑pitch.',
      icon: Sparkles
    },
    {
      key: 'listen' as const,
      mode: PitchMode.JUST_LISTEN,
      label: 'Just Listen (Agreeable)',
      description: 'Friendly homeowner, no pushback, scores you at the end.',
      icon: Headphones
    }
  ];
  const activeTrackConfig = trackOptions.find(track => track.key === activeTrack) ?? trackOptions[0];

  const difficultyOptions: { value: DifficultyLevel; label: string }[] = [
    { value: DifficultyLevel.BEGINNER, label: 'Beginner' },
    { value: DifficultyLevel.ROOKIE, label: 'Rookie' },
    { value: DifficultyLevel.PRO, label: 'Pro' },
    { value: DifficultyLevel.VETERAN, label: 'Veteran' },
    { value: DifficultyLevel.ELITE, label: 'Elite' }
  ];

  const handleStart = () => {
    if (!scriptContent.trim()) {
      setError('Select a script or paste a custom script to start.');
      return;
    }

    // DEBUG: Log script values to trace the bug
    console.log('=== AGNES SCRIPT DEBUG (AgnesLearningPanel) ===');
    console.log('useCustomScript:', useCustomScript);
    console.log('customScript length:', customScript.length);
    console.log('scriptId:', scriptId);
    console.log('selectedScript?.id:', selectedScript?.id);
    console.log('selectedScript?.title:', selectedScript?.title);
    console.log('scriptContent length:', scriptContent.length);
    console.log('scriptContent preview:', scriptContent.substring(0, 100));

    const config: SessionConfig = {
      mode: activeTrackConfig.mode,
      difficulty,
      script: scriptContent,
      scriptId: useCustomScript ? undefined : selectedScript?.id,
      division: 'insurance'
    };

    console.log('config.script length:', config.script.length);
    console.log('config.scriptId:', config.scriptId);
    console.log('===========================================');

    setError(null);
    setActiveConfig(config);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getDifficultyColor = (difficulty: DifficultyLevel) => {
    switch (difficulty) {
      case DifficultyLevel.BEGINNER: return '#10b981'; // green
      case DifficultyLevel.ROOKIE: return '#3b82f6'; // blue
      case DifficultyLevel.PRO: return '#f59e0b'; // orange
      case DifficultyLevel.VETERAN: return '#f97316'; // orange-red
      case DifficultyLevel.ELITE: return '#ef4444'; // red
      default: return '#6b7280';
    }
  };

  const getModeLabel = (mode: PitchMode) => {
    switch (mode) {
      case PitchMode.ROLEPLAY: return 'Roleplay';
      case PitchMode.COACH: return 'Feedback';
      case PitchMode.JUST_LISTEN: return 'Just Listen';
      default: return 'Unknown';
    }
  };

  const handleShareToTeam = async (session: SessionData) => {
    if (!user) return;

    setSharingSessionId(session.sessionId);
    setShareSuccess(null);

    try {
      // Create summary from transcript
      const transcriptSummary = session.transcript && session.transcript.length > 0
        ? session.transcript
            .slice(-3) // Last 3 messages
            .map(msg => `${msg.role === 'agnes' ? 'Agnes' : 'You'}: ${msg.text.substring(0, 100)}${msg.text.length > 100 ? '...' : ''}`)
            .join('\n')
        : 'No transcript available';

      // Create post content
      const postContent = `📊 Agnes Training Session Complete!

**Score:** ${session.finalScore || 'N/A'}/100
**Mode:** ${getModeLabel(session.mode)}
**Difficulty:** ${session.difficulty}
**Duration:** ${formatDuration(session.duration)}
**Date:** ${formatDate(new Date(session.timestamp))}

**Key Highlights:**
${transcriptSummary}

Keep grinding! 🔥`;

      // Post to The Roof feed
      const post = await roofService.createPost(postContent, 'text');

      if (post) {
        setShareSuccess(session.sessionId);
        setTimeout(() => setShareSuccess(null), 3000);
      } else {
        throw new Error('Failed to create post');
      }
    } catch (error) {
      console.error('Error sharing session to team:', error);
      alert('Failed to share session to team. Please try again.');
    } finally {
      setSharingSessionId(null);
    }
  };

  if (activeConfig) {
    return (
      <div className="roof-er-content-area">
        <AgnesAuthProvider>
          <PitchTrainer
            config={activeConfig}
            onEndSession={() => setActiveConfig(null)}
          />
        </AgnesAuthProvider>
      </div>
    );
  }

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <div className="roof-er-page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <Sparkles className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
              Agnes 21 Learning
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Feedback roleplay and just-listen training with Agnes 21.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowMySessionsModal(true)}
              className="roof-er-header-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1rem',
                borderRadius: '999px',
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.4)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <History className="w-3.5 h-3.5" />
              My Sessions
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.9rem', borderRadius: '999px', background: 'rgba(196,30,58,0.15)', border: '1px solid rgba(196,30,58,0.4)', color: 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 600 }}>
              Mic + camera required for live coaching
            </div>
          </div>
        </div>

        {missingClientKey && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
            Missing client Gemini key. Add `VITE_GEMINI_API_KEY` (or `VITE_GOOGLE_AI_API_KEY`) in Railway, then redeploy.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.9rem' }}>
                Training Tracks
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {trackOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = activeTrack === option.key;
                  return (
                    <button
                      key={option.key}
                      onClick={() => setActiveTrack(option.key)}
                      style={{
                        textAlign: 'left',
                        padding: '0.9rem',
                        borderRadius: '14px',
                        border: isSelected ? '1px solid rgba(196,30,58,0.6)' : '1px solid var(--border-subtle)',
                        background: isSelected ? 'rgba(196,30,58,0.12)' : 'rgba(10,10,10,0.55)',
                        color: 'var(--text-primary)',
                        boxShadow: isSelected ? 'var(--shadow-red)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Icon className="w-4 h-4" style={{ color: isSelected ? 'var(--roof-red)' : 'var(--text-tertiary)' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{option.label}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{option.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.9rem' }}>
                Difficulty
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {difficultyOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setDifficulty(option.value)}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: '999px',
                      border: difficulty === option.value ? '1px solid rgba(250,204,21,0.7)' : '1px solid var(--border-subtle)',
                      background: difficulty === option.value ? 'rgba(250,204,21,0.16)' : 'rgba(10,10,10,0.5)',
                      color: difficulty === option.value ? '#fde68a' : 'var(--text-tertiary)',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      cursor: 'pointer'
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)' }}>
                Script
              </div>
              <button
                onClick={() => setUseCustomScript(prev => !prev)}
                style={{
                  borderRadius: '999px',
                  padding: '0.4rem 0.85rem',
                  border: useCustomScript ? '1px solid rgba(196,30,58,0.6)' : '1px solid var(--border-subtle)',
                  background: useCustomScript ? 'rgba(196,30,58,0.18)' : 'rgba(10,10,10,0.5)',
                  color: 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer'
                }}
              >
                {useCustomScript ? 'Custom Script: On' : 'Use Custom Script'}
              </button>
            </div>

            {!useCustomScript && (
              <select
                value={scriptId}
                onChange={(e) => handleScriptChange(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(10,10,10,0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '0.6rem 0.75rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem'
                }}
              >
                {Object.entries(groupedScripts).map(([label, entries]) => (
                  <optgroup key={label} label={label}>
                    {entries.map(script => (
                      <option key={script.id} value={script.id}>
                        {script.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="Custom">
                  <option value="__custom__">Custom Script</option>
                </optgroup>
              </select>
            )}

            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Loaded {scripts.length} insurance scripts from Agnes 21.
            </div>

            <textarea
              value={scriptContent}
              onChange={(e) => setCustomScript(e.target.value)}
              readOnly={!useCustomScript}
              placeholder="Paste your script here..."
              style={{
                width: '100%',
                minHeight: '280px',
                background: 'rgba(6,6,6,0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '0.9rem',
                color: 'var(--text-primary)',
                fontSize: '0.78rem',
                lineHeight: 1.6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
              }}
            />

            {error && (
              <div style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{error}</div>
            )}

            <button
              onClick={handleStart}
              className="roof-er-header-btn"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: '1px solid rgba(196,30,58,0.7)',
                background: 'linear-gradient(135deg, rgba(196,30,58,0.9), rgba(138,21,40,0.9))',
                boxShadow: 'var(--shadow-red-lg)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase'
              }}
            >
              <Play className="w-4 h-4" />
              Start Session
            </button>
          </div>
        </div>

        {/* My Sessions Modal */}
        {showMySessionsModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}
            onClick={() => {
              setShowMySessionsModal(false);
              setSelectedSession(null);
            }}
          >
            <div
              className="glass-card"
              style={{
                maxWidth: '900px',
                width: '100%',
                maxHeight: '85vh',
                padding: '1.5rem',
                borderRadius: '20px',
                overflow: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <History className="w-6 h-6" style={{ color: 'var(--roof-red)' }} />
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    My Training Sessions
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowMySessionsModal(false);
                    setSelectedSession(null);
                  }}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)'
                  }}
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>

              {(() => {
                const sessions = getSessions(user?.id);
                const stats = getSessionStats(user?.id);

                if (sessions.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                      <History className="w-12 h-12" style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                      <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No training sessions yet</p>
                      <p style={{ fontSize: '0.85rem' }}>Complete your first session to see your history here!</p>
                    </div>
                  );
                }

                // Sort sessions by most recent first
                const sortedSessions = [...sessions].sort((a, b) =>
                  new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );

                return (
                  <>
                    {/* Stats Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div className="glass-card" style={{ padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                          Total Sessions
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--roof-red)' }}>
                          {stats.totalSessions}
                        </div>
                      </div>
                      <div className="glass-card" style={{ padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                          Average Score
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#3b82f6' }}>
                          {stats.averageScore}
                        </div>
                      </div>
                      <div className="glass-card" style={{ padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                          Best Score
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>
                          {stats.bestScore}
                        </div>
                      </div>
                    </div>

                    {/* Sessions List */}
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
                      Recent Sessions
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {sortedSessions.map((session, index) => (
                        <div key={session.sessionId} style={{ position: 'relative' }}>
                          <div
                            className="glass-card"
                            style={{
                              padding: '1rem',
                              borderRadius: '12px',
                              cursor: 'pointer',
                              border: selectedSession?.sessionId === session.sessionId ? '1px solid rgba(196,30,58,0.6)' : '1px solid var(--border-subtle)',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => setSelectedSession(selectedSession?.sessionId === session.sessionId ? null : session)}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                                    <Calendar className="w-3.5 h-3.5" />
                                    {formatDate(new Date(session.timestamp))}
                                  </div>
                                  {session.duration && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                                      <Clock className="w-3.5 h-3.5" />
                                      {formatDuration(session.duration)}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      padding: '0.25rem 0.6rem',
                                      borderRadius: '999px',
                                      background: `${getDifficultyColor(session.difficulty)}20`,
                                      border: `1px solid ${getDifficultyColor(session.difficulty)}60`,
                                      color: getDifficultyColor(session.difficulty),
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.08em'
                                    }}
                                  >
                                    {session.difficulty}
                                  </span>
                                  <span
                                    style={{
                                      padding: '0.25rem 0.6rem',
                                      borderRadius: '999px',
                                      background: 'rgba(59,130,246,0.15)',
                                      border: '1px solid rgba(59,130,246,0.4)',
                                      color: '#60a5fa',
                                      fontSize: '0.7rem',
                                      fontWeight: 600
                                    }}
                                  >
                                    {getModeLabel(session.mode)}
                                  </span>
                                  {session.scriptName && (
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                                      {session.scriptName}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                {session.finalScore !== undefined && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <Award className="w-4 h-4" style={{ color: 'var(--roof-red)' }} />
                                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                      {session.finalScore}
                                    </span>
                                  </div>
                                )}
                                {selectedSession?.sessionId === session.sessionId ? (
                                  <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                ) : (
                                  <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Expanded Session Details */}
                          {selectedSession?.sessionId === session.sessionId && (
                            <div
                              className="glass-card"
                              style={{
                                marginTop: '0.5rem',
                                padding: '1rem',
                                borderRadius: '12px',
                                background: 'rgba(6,6,6,0.6)',
                                border: '1px solid var(--border-subtle)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)' }}>
                                  Session Transcript
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShareToTeam(session);
                                  }}
                                  disabled={sharingSessionId === session.sessionId}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '999px',
                                    background: shareSuccess === session.sessionId
                                      ? 'rgba(16,185,129,0.15)'
                                      : 'rgba(59,130,246,0.15)',
                                    border: shareSuccess === session.sessionId
                                      ? '1px solid rgba(16,185,129,0.4)'
                                      : '1px solid rgba(59,130,246,0.4)',
                                    color: shareSuccess === session.sessionId
                                      ? '#10b981'
                                      : '#60a5fa',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    cursor: sharingSessionId === session.sessionId ? 'not-allowed' : 'pointer',
                                    opacity: sharingSessionId === session.sessionId ? 0.6 : 1,
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                  {sharingSessionId === session.sessionId
                                    ? 'Sharing...'
                                    : shareSuccess === session.sessionId
                                    ? 'Shared!'
                                    : 'Share to Team'}
                                </button>
                              </div>
                              {session.transcript && session.transcript.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                  {session.transcript.map((msg, idx) => (
                                    <div
                                      key={idx}
                                      style={{
                                        padding: '0.75rem',
                                        borderRadius: '10px',
                                        background: msg.role === 'agnes' ? 'rgba(196,30,58,0.08)' : 'rgba(59,130,246,0.08)',
                                        border: msg.role === 'agnes' ? '1px solid rgba(196,30,58,0.3)' : '1px solid rgba(59,130,246,0.3)'
                                      }}
                                    >
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.35rem' }}>
                                        {msg.role === 'agnes' ? 'Agnes' : 'You'}
                                      </div>
                                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                        {msg.text}
                                      </div>
                                      {msg.score !== undefined && (
                                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                          <Target className="w-3.5 h-3.5" />
                                          Score: {msg.score}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                  No transcript available for this session
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Wrap with AgnesAuthProvider to enable useAuth hook
const AgnesLearningPanel: React.FC = () => {
  return (
    <AgnesAuthProvider>
      <AgnesLearningContent />
    </AgnesAuthProvider>
  );
};

export default AgnesLearningPanel;
