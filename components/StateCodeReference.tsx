import React from 'react';
import { AlertCircle, CheckCircle, XCircle, Info } from 'lucide-react';

interface StateCodeReferenceProps {
  selectedState: 'VA' | 'MD' | 'PA' | null;
}

const StateCodeReference: React.FC<StateCodeReferenceProps> = ({ selectedState }) => {
  if (!selectedState) {
    return (
      <div style={{
        padding: '16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Info className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Select a state to see specific building codes and strategies
          </span>
        </div>
      </div>
    );
  }

  const stateInfo = {
    MD: {
      name: 'Maryland',
      color: '#FFC107',
      icon: <CheckCircle className="w-5 h-5" />,
      matchingRequired: true,
      primaryStrategy: 'IRC R908.3 Matching Requirements',
      tips: [
        'Maryland building codes require uniform appearance across roof planes',
        'Use matching arguments AGGRESSIVELY - this is your strongest argument',
        'Code-compliant work requires full replacement when matching is impossible',
        'Cite IRC R908.3 and state-specific matching regulations'
      ],
      codes: ['IRC R908.3', 'MD Building Code R908.3', 'Matching Requirements']
    },
    VA: {
      name: 'Virginia',
      color: '#F44336',
      icon: <XCircle className="w-5 h-5" />,
      matchingRequired: false,
      primaryStrategy: 'Repairability & Missed Damage',
      tips: [
        'Virginia does NOT require matching unless policy has matching endorsement',
        'DO NOT use matching arguments without confirming endorsement',
        'Use brittleness tests and repair attempt documentation',
        'Focus on differing dimensions and missed storm damage',
        'Document repair attempts showing damage spreads'
      ],
      codes: ['VA Building Code', 'Repairability Tests', 'Storm Damage Documentation']
    },
    PA: {
      name: 'Pennsylvania',
      color: '#2196F3',
      icon: <AlertCircle className="w-5 h-5" />,
      matchingRequired: false,
      primaryStrategy: 'Permit Denials & Building Codes',
      tips: [
        'Pennsylvania does NOT require matching unless policy has endorsement',
        'Permit denials are HIGHLY EFFECTIVE in PA',
        'Apply for partial permit, use denial as evidence for full replacement',
        'Township building code requirements supersede insurance decisions',
        'Focus on code compliance and permit requirements'
      ],
      codes: ['PA Building Codes', 'Township Permit Requirements', 'IRC Compliance']
    }
  };

  const info = stateInfo[selectedState];

  return (
    <div style={{
      padding: '18px',
      background: `linear-gradient(135deg, ${info.color}15 0%, ${info.color}08 100%)`,
      border: `2px solid ${info.color}`,
      borderRadius: 'var(--radius-lg)',
      marginBottom: '20px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ color: info.color }}>{info.icon}</div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {info.name} Building Codes
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {info.matchingRequired ? '✓ Matching Required' : '⚠️ Matching Not Required'}
          </div>
        </div>
      </div>

      {/* Primary Strategy */}
      <div style={{
        padding: '12px',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '12px'
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Primary Strategy
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {info.primaryStrategy}
        </div>
      </div>

      {/* Key Tips */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Key Tips
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.7', color: 'var(--text-primary)' }}>
          {info.tips.map((tip, idx) => (
            <li key={idx} style={{ marginBottom: '6px' }}>{tip}</li>
          ))}
        </ul>
      </div>

      {/* Relevant Codes */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Relevant Codes
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {info.codes.map((code, idx) => (
            <span key={idx} style={{
              padding: '6px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)'
            }}>
              {code}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StateCodeReference;
