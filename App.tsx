import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import HomePage from './components/HomePage';
import ChatPanel from './components/ChatPanel';
import ImageAnalysisPanel from './components/ImageAnalysisPanel';
import TranscriptionPanel from './components/TranscriptionPanel';
import EmailPanel from './components/EmailPanel';
import MapsPanel from './components/MapsPanel';
import LivePanel from './components/LivePanel';
import KnowledgePanel from './components/KnowledgePanel';
import LoginPage from './components/LoginPage';
import UserProfile from './components/UserProfile';
import { authService, AuthUser } from './services/authService';
import { Settings, History, Menu, X } from 'lucide-react';

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType>('home');
  const [emailContext, setEmailContext] = useState<{template: string; context: string} | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  }, []);

  const pageTitles: Record<PanelType, string> = {
    home: 'Home',
    chat: 'Chat',
    knowledge: 'Knowledge Base',
    image: 'Image Analysis',
    transcribe: 'Transcription',
    email: 'Email Generator',
    maps: 'Insurance Co',
    live: 'Live Conversation'
  };

  const handleStartEmail = (template: string, context: string) => {
    setEmailContext({ template, context });
    setActivePanel('email');
  };

  const handleOpenDocument = (documentPath: string) => {
    setSelectedDocument(documentPath);
    setActivePanel('knowledge');
  };

  const handleLoginSuccess = () => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    setShowUserProfile(false);
    setActivePanel('home');
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const renderPanel = () => {
    switch (activePanel) {
      case 'home':
        return <HomePage setActivePanel={setActivePanel} />;
      case 'chat':
        return <ChatPanel onStartEmail={handleStartEmail} onOpenDocument={handleOpenDocument} />;
      case 'image':
        return <ImageAnalysisPanel />;
      case 'transcribe':
        return <TranscriptionPanel />;
      case 'email':
        return <EmailPanel emailContext={emailContext} onContextUsed={() => setEmailContext(null)} />;
      case 'maps':
        return <MapsPanel />;
      case 'live':
        return <LivePanel />;
      case 'knowledge':
        return <KnowledgePanel selectedDocument={selectedDocument} onDocumentViewed={() => setSelectedDocument(null)} />;
      default:
        return <HomePage setActivePanel={setActivePanel} />;
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="roof-er-header">
        <div className="roof-er-header-left">
          {/* Mobile Menu Button */}
          <button
            className="roof-er-mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

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
          {currentUser && (
            <div
              className="roof-er-header-btn cursor-pointer"
              onClick={() => setShowUserProfile(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'var(--roof-red)' }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden md:inline">{currentUser.name}</span>
            </div>
          )}
          <button
            className="roof-er-header-btn"
            onClick={() => setShowUserProfile(true)}
          >
            <Settings className="w-4 h-4 inline mr-1" />
            Settings
          </button>
          <button className="roof-er-header-btn">
            <History className="w-4 h-4 inline mr-1" />
            History
          </button>
        </div>
      </header>

      {/* User Profile Modal */}
      {showUserProfile && (
        <UserProfile
          onClose={() => setShowUserProfile(false)}
          onLogout={handleLogout}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-1">
        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
          <div
            className="roof-er-mobile-overlay"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar with mobile support */}
        <div className={`roof-er-sidebar-wrapper ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          <Sidebar
            activePanel={activePanel}
            setActivePanel={(panel) => {
              setActivePanel(panel);
              setIsMobileMenuOpen(false); // Close menu when item is selected
            }}
          />
        </div>

        <main className="flex-1">
          {renderPanel()}
        </main>
      </div>
    </div>
  );
};

export default App;
