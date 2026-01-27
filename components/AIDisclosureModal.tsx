/**
 * AI Disclosure Modal
 * Required by Apple App Store for apps using AI (November 2025)
 * Clean, professional design with red/black/white theme
 */

import React, { useState } from 'react';
import { Bot, Check, Shield } from 'lucide-react';

interface AIDisclosureModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

const AI_CONSENT_KEY = 's21_ai_consent';
const AI_CONSENT_VERSION = '1.0';

export const hasAIConsent = (): boolean => {
  try {
    const stored = localStorage.getItem(AI_CONSENT_KEY);
    if (!stored) return false;
    const consent = JSON.parse(stored);
    return consent.version === AI_CONSENT_VERSION && consent.accepted === true;
  } catch {
    return false;
  }
};

export const saveAIConsent = (accepted: boolean): void => {
  localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
    version: AI_CONSENT_VERSION,
    accepted,
    timestamp: new Date().toISOString()
  }));
};

const AIDisclosureModal: React.FC<AIDisclosureModalProps> = ({ onAccept, onDecline }) => {
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    saveAIConsent(true);
    onAccept();
  };

  const handleDecline = () => {
    saveAIConsent(false);
    onDecline();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 10001
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: '#0a0a0a',
          borderRadius: '20px',
          border: '1px solid #262626',
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.8)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '28px 24px 20px',
            textAlign: 'center',
            borderBottom: '1px solid #262626'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 16px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Bot style={{ width: '28px', height: '28px', color: '#ffffff' }} />
          </div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#ffffff',
              margin: '0 0 6px 0'
            }}
          >
            AI-Powered Features
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: '#a1a1aa',
              margin: 0
            }}
          >
            Susan AI-21 uses Google Gemini AI
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px' }}>
          {/* Features List */}
          <div
            style={{
              background: '#171717',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}
          >
            <p
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#ffffff',
                margin: '0 0 12px 0'
              }}
            >
              AI provides these features:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                'Chat assistance with Susan AI',
                'Photo & document analysis',
                'Email draft generation',
                'Voice transcription',
                'Insurance claim guidance'
              ].map((feature, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#dc2626',
                      flexShrink: 0
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#d4d4d8' }}>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Important Notice */}
          <div
            style={{
              background: '#171717',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}
          >
            <p
              style={{
                fontSize: '12px',
                color: '#a1a1aa',
                margin: 0,
                lineHeight: '1.5'
              }}
            >
              Your inputs are processed by Google's servers. AI responses may contain
              errors and don't replace professional advice. You can delete your data
              anytime in Settings.
            </p>
          </div>

          {/* Agreement Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              padding: '14px',
              background: agreed ? 'rgba(220, 38, 38, 0.1)' : '#171717',
              borderRadius: '12px',
              border: agreed ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ display: 'none' }}
            />
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '6px',
                background: agreed ? '#dc2626' : '#262626',
                border: agreed ? 'none' : '2px solid #404040',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.2s'
              }}
            >
              {agreed && <Check style={{ width: '14px', height: '14px', color: '#ffffff' }} />}
            </div>
            <span
              style={{
                fontSize: '14px',
                color: '#ffffff',
                lineHeight: '1.4'
              }}
            >
              I understand and agree to use AI features
            </span>
          </label>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <button
            onClick={handleAccept}
            disabled={!agreed}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#ffffff',
              background: agreed
                ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                : '#262626',
              border: 'none',
              borderRadius: '12px',
              cursor: agreed ? 'pointer' : 'not-allowed',
              opacity: agreed ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <Shield style={{ width: '18px', height: '18px' }} />
            Continue with AI
          </button>

          <button
            onClick={handleDecline}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#71717a',
              background: 'transparent',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer'
            }}
          >
            Use without AI features
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIDisclosureModal;
