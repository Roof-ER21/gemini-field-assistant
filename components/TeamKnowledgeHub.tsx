import React, { useState } from 'react';
import LearningDashboard from './LearningDashboard';
import AgentNetworkPanel from './AgentNetworkPanel';

type Tab = 'learning' | 'agent';

const TABS: { id: Tab; label: string }[] = [
  { id: 'learning', label: 'Learning Analytics' },
  { id: 'agent',    label: 'Agent Intel' },
];

const TeamKnowledgeHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('learning');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 16px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--roof-red)' : 'var(--bg-hover)',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'learning' ? <LearningDashboard /> : <AgentNetworkPanel />}
      </div>
    </div>
  );
};

export default TeamKnowledgeHub;
