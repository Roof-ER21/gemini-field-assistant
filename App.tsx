import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import ImageAnalysisPanel from './components/ImageAnalysisPanel';
import TranscriptionPanel from './components/TranscriptionPanel';
import EmailPanel from './components/EmailPanel';
import MapsPanel from './components/MapsPanel';
import LivePanel from './components/LivePanel';
import KnowledgePanel from './components/KnowledgePanel';
import { Settings, History } from 'lucide-react';

type PanelType = 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge';

const App: React.FC = () => {
  const [activePanel, setActivePanel] = useState<PanelType>('chat');

  const pageTitles: Record<PanelType, string> = {
    chat: 'Chat',
    knowledge: 'Knowledge Base',
    image: 'Image Analysis',
    transcribe: 'Transcription',
    email: 'Email Generator',
    maps: 'Maps',
    live: 'Live Conversation'
  };

  const renderPanel = () => {
    switch (activePanel) {
      case 'chat':
        return <ChatPanel />;
      case 'image':
        return <ImageAnalysisPanel />;
      case 'transcribe':
        return <TranscriptionPanel />;
      case 'email':
        return <EmailPanel />;
      case 'maps':
        return <MapsPanel />;
      case 'live':
        return <LivePanel />;
      case 'knowledge':
        return <KnowledgePanel />;
      default:
        return <ChatPanel />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="roof-er-header">
        <div className="roof-er-header-left">
          <div className="roof-er-logo">
            <span>ROOF ER</span>
          </div>
          <div className="roof-er-app-title">S21 FIELD AI</div>
          <div className="roof-er-page-subtitle">{pageTitles[activePanel]}</div>
        </div>
        <div className="roof-er-header-actions">
          <div className="roof-er-status-badge">
            <div className="roof-er-status-dot"></div>
            <span>4 AI Systems Active</span>
          </div>
          <button className="roof-er-header-btn">
            <Settings className="w-4 h-4 inline mr-1" />
            Settings
          </button>
          <button className="roof-er-header-btn">
            <History className="w-4 h-4 inline mr-1" />
            History
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activePanel={activePanel} setActivePanel={setActivePanel} />
        <main className="flex-1 overflow-hidden">
          {renderPanel()}
        </main>
      </div>
    </div>
  );
};

export default App;
