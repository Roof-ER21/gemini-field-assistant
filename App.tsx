import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import ImageAnalysisPanel from './components/ImageAnalysisPanel';
import TranscriptionPanel from './components/TranscriptionPanel';
import EmailPanel from './components/EmailPanel';
import MapsPanel from './components/MapsPanel';
import LivePanel from './components/LivePanel';
import KnowledgePanel from './components/KnowledgePanel';
import Logo from './components/icons/Logo';

type PanelType = 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge';

const App: React.FC = () => {
  const [activePanel, setActivePanel] = useState<PanelType>('chat');

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
    <div className="flex h-screen bg-zinc-900 text-white font-sans">
        <aside className="w-64 bg-zinc-900 flex-shrink-0 p-4 border-r border-zinc-700 flex flex-col">
            <div className="flex items-center space-x-2 mb-8 p-2">
                 <Logo className="h-10 w-auto" />
                 <span className="text-xl font-bold text-red-500">S21 CORE</span>
            </div>
            <Sidebar activePanel={activePanel} setActivePanel={setActivePanel} />
             <div className="mt-auto text-center text-zinc-500 text-xs">
                <p>S21 Interface v3.1</p>
                <p>&copy; 2024 Weyland-Yutani Corp</p>
            </div>
        </aside>
      <main className="flex-1">
        {renderPanel()}
      </main>
    </div>
  );
};

export default App;
