import React, { useMemo, useState } from 'react';
import { Headphones, Play, Sparkles, Users } from 'lucide-react';
import PitchTrainer from '../agnes21/components/PitchTrainer';
import { PitchMode, DifficultyLevel, SessionConfig } from '../agnes21/types';
import { getScriptsByDivision, getScriptById, PhoneScript } from '../agnes21/utils/phoneScripts';
import { AgnesAuthProvider } from '../agnes21/contexts/AuthContext';

const AgnesLearningPanel: React.FC = () => {
  const scripts = useMemo(() => getScriptsByDivision('insurance'), []);
  const [activeTrack, setActiveTrack] = useState<'roleplay' | 'feedback' | 'listen'>('roleplay');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(DifficultyLevel.ROOKIE);
  const [scriptId, setScriptId] = useState<string>(scripts[0]?.id || '');
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<SessionConfig | null>(null);
  const missingClientKey = !import.meta.env.VITE_GEMINI_API_KEY && !import.meta.env.VITE_GOOGLE_AI_API_KEY;

  const selectedScript = useMemo(() => getScriptById(scriptId), [scriptId]);
  const scriptContent = useCustomScript ? customScript : (selectedScript?.content || '');
  const groupedScripts = useMemo(() => {
    const groups: Record<string, PhoneScript[]> = {};
    const labelFor = (category: PhoneScript['category']) => {
      if (category === 'door-to-door' || category === 'authorization') return 'Door-to-Door';
      if (category === 'estimate') return 'Estimate Calls';
      if (category === 'pushback' || category === 'objection') return 'Insurance Pushback';
      return 'Other';
    };
    scripts.forEach(script => {
      const label = labelFor(script.category);
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

    const config: SessionConfig = {
      mode: activeTrackConfig.mode,
      difficulty,
      script: scriptContent,
      scriptId: useCustomScript ? undefined : selectedScript?.id,
      division: 'insurance'
    };

    setError(null);
    setActiveConfig(config);
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
              Agnes Learning
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Feedback roleplay and just-listen training with Agnes 21.
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.9rem', borderRadius: '999px', background: 'rgba(196,30,58,0.15)', border: '1px solid rgba(196,30,58,0.4)', color: 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 600 }}>
            Mic + camera required for live coaching
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
      </div>
    </div>
  );
};

export default AgnesLearningPanel;
