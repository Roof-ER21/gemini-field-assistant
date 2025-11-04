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
    const context = instructions ? `${instructions}\n\nSubject: ${subject}` : `Subject: ${subject}`;
    onStartEmail({ template, context });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.75)' }} aria-modal>
      <div className="w-full sm:w-[640px] max-w-[96%] rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{
        background: 'linear-gradient(135deg, rgba(26, 31, 46, 1) 0%, rgba(15, 20, 25, 1) 100%)',
        border: '2px solid rgba(239, 68, 68, 0.3)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(239, 68, 68, 0.2)'
      }} role="dialog">
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(239,68,68,0.25) 0%, rgba(239,68,68,0.1) 100%)',
          borderBottom: '2px solid rgba(239, 68, 68, 0.3)'
        }} className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: '#ef4444' }} />
            <div className="font-bold text-lg" style={{ color: '#ffffff' }}>Quick Actions</div>
          </div>
          <button
            className="roof-er-header-btn"
            onClick={onClose}
            aria-label="Close quick actions"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff'
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-3" style={{ borderBottom: '2px solid rgba(239, 68, 68, 0.2)', background: 'rgba(0, 0, 0, 0.3)' }}>
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
                style={{
                  border: selected ? '2px solid rgba(255, 255, 255, 0.3)' : '2px solid rgba(255, 255, 255, 0.1)',
                  background: selected ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'rgba(255, 255, 255, 0.05)',
                  color: selected ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                  fontWeight: selected ? '600' : '500',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
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
            <div className="grid gap-3 p-4" style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div className="grid gap-1">
                <label className="text-sm font-semibold" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Recipient (optional)</label>
                <input
                  className="px-3 py-2 rounded-lg"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '2px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}
                  placeholder="e.g., Sarah from State Farm"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-semibold" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Subject (optional)</label>
                <input
                  className="px-3 py-2 rounded-lg"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '2px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}
                  placeholder="Subject line"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-semibold" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Instructions / Context (optional)</label>
                <textarea
                  className="px-3 py-2 rounded-lg min-h-[96px]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '2px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}
                  placeholder="Any specific details to include"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="roof-er-header-btn"
                  onClick={onClose}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontWeight: '600'
                  }}
                >
                  Cancel
                </button>
                <button
                  className="roof-er-header-btn"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 8px 20px rgba(239,68,68,0.5)',
                    fontWeight: '700'
                  }}
                  onClick={startEmail}
                >
                  Start Email
                </button>
              </div>
            </div>
          )}

          {active === 'transcribe' && (
            <div className="grid gap-3 p-4" style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500' }}>
                Jump into Transcription to record a voice note and convert to text.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="roof-er-header-btn"
                  onClick={onClose}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontWeight: '600'
                  }}
                >
                  Cancel
                </button>
                <button
                  className="roof-er-header-btn"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 8px 20px rgba(239,68,68,0.5)',
                    fontWeight: '700'
                  }}
                  onClick={() => { onGoTranscribe(); onClose(); }}
                >
                  Go to Transcription
                </button>
              </div>
            </div>
          )}

          {active === 'image' && (
            <div className="grid gap-3 p-4" style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <p style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500' }}>
                Upload roof photos for AI-powered damage assessment and reporting.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="roof-er-header-btn"
                  onClick={onClose}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontWeight: '600'
                  }}
                >
                  Cancel
                </button>
                <button
                  className="roof-er-header-btn"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 8px 20px rgba(239,68,68,0.5)',
                    fontWeight: '700'
                  }}
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
