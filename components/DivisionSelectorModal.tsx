import React, { useState } from 'react';
import { Home, Shield } from 'lucide-react';
import { Division } from '../services/authService';

interface DivisionSelectorModalProps {
  onSelect: (division: Division) => void;
}

const DivisionSelectorModal: React.FC<DivisionSelectorModalProps> = ({ onSelect }) => {
  const [selected, setSelected] = useState<Division | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirming(true);
    onSelect(selected);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      zIndex: 100000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--bg-primary)',
        borderRadius: '20px',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '28px 24px 16px',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
          }}>
            Welcome to Susan 21
          </h2>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-tertiary)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            Which team are you on? This sets up your training, knowledge base, and AI assistant.
          </p>
        </div>

        {/* Options */}
        <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Insurance */}
          <button
            onClick={() => setSelected('insurance')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '20px',
              background: selected === 'insurance' ? 'rgba(220, 38, 38, 0.1)' : 'var(--bg-secondary)',
              border: selected === 'insurance' ? '2px solid #dc2626' : '2px solid var(--border-subtle)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'left',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: selected === 'insurance' ? '#dc2626' : 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}>
              <Shield style={{ width: '24px', height: '24px', color: selected === 'insurance' ? 'white' : 'var(--text-tertiary)' }} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Insurance
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                Claims, adjusters, building codes, supplements
              </div>
            </div>
          </button>

          {/* Retail */}
          <button
            onClick={() => setSelected('retail')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '20px',
              background: selected === 'retail' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
              border: selected === 'retail' ? '2px solid #3b82f6' : '2px solid var(--border-subtle)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'left',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: selected === 'retail' ? '#3b82f6' : 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}>
              <Home style={{ width: '24px', height: '24px', color: selected === 'retail' ? 'white' : 'var(--text-tertiary)' }} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Retail
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                Door-to-door, product pitches, homeowner quotes
              </div>
            </div>
          </button>
        </div>

        {/* Confirm */}
        <div style={{
          padding: '0 24px 24px',
        }}>
          <button
            onClick={handleConfirm}
            disabled={!selected || confirming}
            style={{
              width: '100%',
              padding: '14px',
              background: selected
                ? `linear-gradient(135deg, ${selected === 'insurance' ? '#dc2626, #b91c1c' : '#3b82f6, #2563eb'})`
                : 'var(--bg-secondary)',
              border: 'none',
              borderRadius: '12px',
              color: selected ? 'white' : 'var(--text-tertiary)',
              fontSize: '15px',
              fontWeight: 700,
              cursor: selected ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              opacity: confirming ? 0.7 : 1,
            }}
          >
            {confirming ? 'Setting up...' : selected ? `Continue as ${selected === 'insurance' ? 'Insurance' : 'Retail'}` : 'Select your team'}
          </button>
          <p style={{
            fontSize: '11px',
            color: 'var(--text-disabled)',
            textAlign: 'center',
            marginTop: '12px',
          }}>
            This can only be changed by an admin later.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DivisionSelectorModal;
