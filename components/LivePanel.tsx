import React, { useState } from 'react';
import { Radio, Play, Square } from 'lucide-react';

const LivePanel: React.FC = () => {
  const [isLive, setIsLive] = useState(false);

  const handleToggleLive = () => {
    setIsLive(!isLive);
    if (!isLive) {
      alert('Live session started - Real-time AI assistance activated');
    } else {
      alert('Live session ended');
    }
  };

  return (
    <div className="roof-er-content-area">
      <div className="roof-er-content-scroll">
        <div className="roof-er-welcome-screen">
          <div className="roof-er-welcome-icon">
            <Radio className="w-20 h-20" style={{ color: 'var(--roof-red)', opacity: 0.3 }} />
          </div>
          <div className="roof-er-welcome-title">Live Conversation Mode</div>
          <div className="roof-er-welcome-subtitle">
            Real-time AI assistance during customer conversations. Get instant suggestions, objection handlers, and talking points.
          </div>
          <button
            className={`roof-er-send-btn ${isLive ? 'roof-er-bg-red' : ''}`}
            onClick={handleToggleLive}
            style={{
              padding: '16px 32px',
              marginTop: '20px',
              fontSize: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              animation: isLive ? 'pulse 2s infinite' : 'none'
            }}
          >
            {isLive ? (
              <>
                <Square className="w-5 h-5" />
                Stop Live Session
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Start Live Session
              </>
            )}
          </button>
          {isLive && (
            <div style={{
              marginTop: '30px',
              padding: '20px',
              background: 'var(--success-dark)',
              border: '1px solid var(--success)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--success)',
              maxWidth: '400px'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '8px' }}>🔴 LIVE</div>
              <div style={{ fontSize: '14px' }}>
                AI is listening and ready to assist with your conversation
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivePanel;
