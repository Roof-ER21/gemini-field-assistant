import React, { useState, lazy, Suspense } from 'react';
import { BookOpen, Users, ChevronRight } from 'lucide-react';

const KnowledgePanel = lazy(() => import('./KnowledgePanel'));
const TeamKnowledgeHub = lazy(() => import('./TeamKnowledgeHub'));

type Tab = 'docs' | 'team';

interface KnowledgeHubProps {
  selectedDocument?: string | null;
  onDocumentViewed?: () => void;
  onOpenInChat?: (doc: { name: string; path: string }) => void;
}

const KnowledgeHub: React.FC<KnowledgeHubProps> = ({
  selectedDocument,
  onDocumentViewed,
  onOpenInChat,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('docs');

  const tabs = [
    { id: 'docs' as Tab, label: 'Documents', icon: BookOpen, desc: 'Scripts, templates & guides' },
    { id: 'team' as Tab, label: 'Team Intel', icon: Users, desc: 'Learnings & field tips' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: isActive ? '2px solid var(--roof-red)' : '2px solid var(--border-subtle)',
                background: isActive ? 'var(--roof-red)' : 'var(--bg-secondary)',
                color: isActive ? 'white' : 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={
          <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: i === 1 ? '48px' : '72px',
                borderRadius: '12px',
                background: 'var(--bg-secondary)',
                animation: 'pulse 1.5s ease-in-out infinite',
                opacity: 1 - (i * 0.15),
              }} />
            ))}
            <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.7 } }`}</style>
          </div>
        }>
          {activeTab === 'docs' ? (
            <KnowledgePanel
              selectedDocument={selectedDocument}
              onDocumentViewed={onDocumentViewed}
              onOpenInChat={onOpenInChat}
            />
          ) : (
            <TeamKnowledgeHub />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default KnowledgeHub;
