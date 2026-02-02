import React, { useMemo, useState } from 'react';
import { Headphones, Play, Sparkles, Users } from 'lucide-react';
import PitchTrainer from '../agnes21/components/PitchTrainer';
import { PitchMode, DifficultyLevel, SessionConfig } from '../agnes21/types';
import { getScriptsByDivision, getScriptById } from '../agnes21/utils/phoneScripts';
import { AgnesAuthProvider } from '../agnes21/contexts/AuthContext';

const AgnesLearningPanel: React.FC = () => {
  const scripts = useMemo(() => getScriptsByDivision('insurance'), []);
  const [mode, setMode] = useState<PitchMode>(PitchMode.ROLEPLAY);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(DifficultyLevel.ROOKIE);
  const [scriptId, setScriptId] = useState<string>(scripts[0]?.id || '');
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<SessionConfig | null>(null);

  const selectedScript = useMemo(() => getScriptById(scriptId), [scriptId]);
  const scriptContent = useCustomScript ? customScript : (selectedScript?.content || '');

  const modeOptions = [
    {
      value: PitchMode.ROLEPLAY,
      label: 'Feedback Roleplay',
      description: 'Agnes plays the homeowner and scores you at the end.',
      icon: Users
    },
    {
      value: PitchMode.JUST_LISTEN,
      label: 'Just Listen',
      description: 'Friendly homeowner, no pushback, still scores you.',
      icon: Headphones
    }
  ];

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
      mode,
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
      <div className="flex-1 min-h-0">
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
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-red-500" />
            Agnes Learning
          </h1>
          <p className="text-neutral-400 mt-1">
            Feedback roleplay and just-listen training with Agnes 21.
          </p>
        </div>
        <div className="text-xs text-neutral-500 bg-black/40 border border-neutral-800 px-3 py-2 rounded-full">
          Mic + camera required for live coaching
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <div className="bg-black/50 border border-neutral-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-neutral-200 mb-4 uppercase tracking-wider">Mode</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {modeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = mode === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setMode(option.value)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-red-500/60 bg-red-500/10 text-white'
                        : 'border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-red-400' : 'text-neutral-500'}`} />
                      <span className="text-sm font-semibold">{option.label}</span>
                    </div>
                    <p className="text-xs text-neutral-400">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-black/50 border border-neutral-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-neutral-200 mb-4 uppercase tracking-wider">Difficulty</h2>
            <div className="flex flex-wrap gap-2">
              {difficultyOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setDifficulty(option.value)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider border transition-all ${
                    difficulty === option.value
                      ? 'border-yellow-500/60 text-yellow-400 bg-yellow-500/10'
                      : 'border-neutral-800 text-neutral-400 bg-neutral-900/40 hover:border-neutral-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-black/50 border border-neutral-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider">Script</h2>
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={useCustomScript}
                onChange={(e) => setUseCustomScript(e.target.checked)}
              />
              Use custom script
            </label>
          </div>

          {!useCustomScript && (
            <select
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200"
            >
              {scripts.map(script => (
                <option key={script.id} value={script.id}>
                  {script.title}
                </option>
              ))}
            </select>
          )}

          <textarea
            className="w-full min-h-[280px] bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 text-xs text-neutral-200 font-mono leading-relaxed"
            value={scriptContent}
            onChange={(e) => setCustomScript(e.target.value)}
            readOnly={!useCustomScript}
            placeholder="Paste your script here..."
          />

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgnesLearningPanel;
