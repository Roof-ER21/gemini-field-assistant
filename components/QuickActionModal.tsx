import React, { useState } from 'react';
import { X, Mail, Mic, Upload, Zap } from 'lucide-react';

type QuickActionType = 'email' | 'transcribe' | 'image';

interface QuickActionModalProps {
  isOpen: boolean;
  initialAction?: QuickActionType;
  onClose: () => void;
  onStartEmail: (context: { template?: string; context?: string }) => void;
  onGoTranscribe: () => void;
  onGoUpload: () => void;
}

const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  initialAction = 'email',
  onClose,
  onStartEmail,
  onGoTranscribe,
  onGoUpload,
}) => {
  const [active, setActive] = useState<QuickActionType>(initialAction);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [instructions, setInstructions] = useState('');

  if (!isOpen) return null;

  const startEmail = () => {
    const greeting = recipient ? `Dear ${recipient},\n\n` : '';
    const template = `${greeting}`;
    onStartEmail({ template, context: instructions ? `${instructions}\n\nSubject: ${subject}` : `Subject: ${subject}` });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      aria-modal
    >
      <div
        className="w-full sm:w-[560px] max-w-[96%] rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: 'var(--roof-red)' }} />
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Quick Actions</div>
          </div>
          <button className="roof-er-header-btn" onClick={onClose} aria-label="Close quick actions">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
          {[
            { id: 'email', label: 'Email', icon: Mail },
            { id: 'transcribe', label: 'Voice Note', icon: Mic },
            { id: 'image', label: 'Upload', icon: Upload },
          ].map((t) => {
            const Icon = t.icon;
            const selected = active === (t.id as QuickActionType);
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id as QuickActionType)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 ${selected ? 'bg-[var(--roof-red)] text-white' : ''}`}
                style={{ border: selected ? '1px solid transparent' : '1px solid var(--border-default)' }}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-4">
          {active === 'email' && (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Recipient (optional)</label>
                <input
                  className="px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  placeholder="e.g., Sarah from State Farm"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Subject (optional)</label>
                <input
                  className="px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  placeholder="Subject line"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Instructions / Context (optional)</label>
                <textarea
                  className="px-3 py-2 rounded-lg min-h-[96px]"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  placeholder="Any specific details to include"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button className="roof-er-header-btn" onClick={onClose}>Cancel</button>
                <button
                  className="roof-er-header-btn"
                  style={{ background: 'var(--roof-red)', color: '#fff', border: '1px solid transparent' }}
                  onClick={startEmail}
                >
                  Start Email
                </button>
              </div>
            </div>
          )}

          {active === 'transcribe' && (
            <div className="grid gap-3">
              <p style={{ color: 'var(--text-secondary)' }}>
                Jump into Transcription to record a voice note and convert to text.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button className="roof-er-header-btn" onClick={onClose}>Cancel</button>
                <button
                  className="roof-er-header-btn"
                  style={{ background: 'var(--roof-red)', color: '#fff', border: '1px solid transparent' }}
                  onClick={() => { onGoTranscribe(); onClose(); }}
                >
                  Go to Transcription
                </button>
              </div>
            </div>
          )}

          {active === 'image' && (
            <div className="grid gap-3">
              <p style={{ color: 'var(--text-secondary)' }}>
                Upload roof photos for AI-powered damage assessment and reporting.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button className="roof-er-header-btn" onClick={onClose}>Cancel</button>
                <button
                  className="roof-er-header-btn"
                  style={{ background: 'var(--roof-red)', color: '#fff', border: '1px solid transparent' }}
                  onClick={() => { onGoUpload(); onClose(); }}
                >
                  Go to Image Analysis
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickActionModal;

