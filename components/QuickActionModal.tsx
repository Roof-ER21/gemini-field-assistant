import React, { useState } from 'react';
import { X, Mail, Mic, Upload } from 'lucide-react';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.75)' }}
      aria-modal
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] mx-4 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
          border: '1px solid #262626',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)'
        }}
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #262626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div className="font-bold" style={{ color: '#ffffff', fontSize: '16px' }}>
            ⚡ Quick Actions
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Three Horizontal Action Buttons */}
        <div style={{ padding: '16px', display: 'flex', gap: '10px' }}>
          {[
            { id: 'email', label: 'Email', icon: Mail },
            { id: 'transcribe', label: 'Voice Note', icon: Mic },
            { id: 'image', label: 'Upload', icon: Upload },
          ].map((action) => {
            const Icon = action.icon;
            const isActive = active === (action.id as QuickActionType);
            return (
              <button
                key={action.id}
                onClick={() => setActive(action.id as QuickActionType)}
                style={{
                  flex: 1,
                  height: '64px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  borderRadius: '12px',
                  border: isActive ? '1px solid #dc2626' : '1px solid #262626',
                  background: isActive
                    ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                    : '#171717',
                  color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '13px'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#262626';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#171717';
                    e.currentTarget.style.color = '#a1a1aa';
                  }
                }}
              >
                <Icon className="w-5 h-5" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div style={{ padding: '0 16px 16px 16px' }}>
          {active === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Recipient Field */}
              <div>
                <input
                  style={{
                    width: '100%',
                    height: '46px',
                    padding: '0 14px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  placeholder="Recipient (optional)"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1px solid #dc2626';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1px solid #262626';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Subject Field */}
              <div>
                <input
                  style={{
                    width: '100%',
                    height: '46px',
                    padding: '0 14px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  placeholder="Subject (optional)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1px solid #dc2626';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1px solid #262626';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Instructions/Context Field */}
              <div>
                <textarea
                  style={{
                    width: '100%',
                    height: '90px',
                    padding: '12px 14px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical',
                    transition: 'all 0.2s',
                    fontFamily: 'inherit'
                  }}
                  placeholder="Instructions / Context (optional)"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1px solid #dc2626';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1px solid #262626';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                marginTop: '8px'
              }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    height: '48px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#262626';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#171717';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={startEmail}
                  style={{
                    flex: 1,
                    height: '48px',
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)';
                  }}
                >
                  Send Email
                </button>
              </div>
            </div>
          )}

          {active === 'transcribe' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '14px',
                lineHeight: '1.6',
                margin: 0
              }}>
                Open the Transcription panel to record voice notes and convert them to text.
              </p>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    height: '48px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#262626';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#171717';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onGoTranscribe(); onClose(); }}
                  style={{
                    flex: 1,
                    height: '48px',
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)';
                  }}
                >
                  Open Transcription
                </button>
              </div>
            </div>
          )}

          {active === 'image' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '14px',
                lineHeight: '1.6',
                margin: 0
              }}>
                Upload roof photos for AI-powered damage assessment and professional reporting.
              </p>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    height: '48px',
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#262626';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#171717';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onGoUpload(); onClose(); }}
                  style={{
                    flex: 1,
                    height: '48px',
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)';
                  }}
                >
                  Open Upload
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
