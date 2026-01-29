import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import HomePage from './components/HomePage';
import ChatPanel from './components/ChatPanel';
import TranscriptionPanel from './components/TranscriptionPanel';
import MapsPanel from './components/MapsPanel';
import DocumentJobPanel from './components/DocumentJobPanel';
import LoginPage from './components/LoginPage';
import UserProfile from './components/UserProfile';
import QuickActionModal from './components/QuickActionModal';
import AIDisclosureModal, { hasAIConsent } from './components/AIDisclosureModal';
import MessagingPanel from './components/MessagingPanel';
import LearningDashboard from './components/LearningDashboard';
import { authService, AuthUser } from './services/authService';
import { Settings, History, Menu, X } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load heavy panels for better performance
const EmailPanel = lazy(() => import('./components/EmailPanel'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const DocumentAnalysisPanel = lazy(() => import('./components/DocumentAnalysisPanel'));
const KnowledgePanel = lazy(() => import('./components/KnowledgePanel'));
const AgnesPanel = lazy(() => import('./components/AgnesPanel'));
const LivePanel = lazy(() => import('./components/LivePanel'));

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge' | 'admin' | 'agnes' | 'documentjob' | 'team' | 'learning';

// Loading fallback component for lazy-loaded panels
const PanelLoader: React.FC = () => (
  <div
    className="flex items-center justify-center h-full"
    style={{
      minHeight: '400px',
      background: 'var(--bg-primary)'
    }}
  >
    <div className="flex flex-col items-center gap-3">
      <div
        className="animate-spin rounded-full h-12 w-12 border-b-2"
        style={{ borderColor: 'var(--roof-red)' }}
      ></div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Loading panel...
      </p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType>('home');
  const [emailContext, setEmailContext] = useState<{template: string; context: string} | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [initialQuickAction, setInitialQuickAction] = useState<'email' | 'transcribe' | 'image'>('email');
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showAIDisclosure, setShowAIDisclosure] = useState(false);
  const [aiConsented, setAIConsented] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      if (detail.type === 'system' && detail.notification?.data?.feedback_id) {
        setActivePanel('learning');
      }
    };
    window.addEventListener('notification-click', handler as EventListener);
    return () => window.removeEventListener('notification-click', handler as EventListener);
  }, []);

  // Check authentication and AI consent on mount
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);

      // Check if user has consented to AI features
      const consent = hasAIConsent();
      setAIConsented(consent);
      if (!consent) {
        setShowAIDisclosure(true);
      }
    }

    // Clear any old user_uploads from localStorage
    // Files should never be saved - only analyzed temporarily
    try {
      localStorage.removeItem('user_uploads');
      console.log('[App] Cleared user_uploads from localStorage on mount');
    } catch (error) {
      console.warn('Could not clear user_uploads:', error);
    }
  }, []);

  const pageTitles: Record<PanelType, string> = {
    home: 'Home',
    chat: 'Chat',
    team: 'Team Messages',
    knowledge: 'Knowledge Base',
    image: 'Upload Analysis',
    transcribe: 'Transcription',
    email: 'Email Generator',
    maps: 'Hail & Insurance',
    live: 'Live Conversation',
    admin: 'Admin Panel',
    agnes: 'Agnes - Objection Handler',
    documentjob: 'Document Job',
    learning: 'Susan Learning'
  };

  const handleStartEmail = (template: string, context: string) => {
    setEmailContext({ template, context });
    setActivePanel('email');
  };

  const handleOpenDocument = (documentPath: string) => {
    setSelectedDocument(documentPath);
    setActivePanel('knowledge');
  };

  const openChat = () => setActivePanel('chat');
  const openChatWithDoc = (doc: { name: string; path: string }) => {
    try {
      localStorage.setItem('chat_quick_doc', JSON.stringify(doc));
    } catch {}
    setActivePanel('chat');
  };

  // Consume knowledge_open_doc marker to open Knowledge on a specific doc
  useEffect(() => {
    try {
      const marker = localStorage.getItem('knowledge_open_doc');
      if (marker) {
        setSelectedDocument(marker);
        setActivePanel('knowledge');
        localStorage.removeItem('knowledge_open_doc');
      }
    } catch {}
  }, [activePanel]);

  const handleLoginSuccess = () => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);

      // Check if user has consented to AI features
      const consent = hasAIConsent();
      setAIConsented(consent);
      if (!consent) {
        setShowAIDisclosure(true);
      }
    }
  };

  const handleAIConsentAccept = () => {
    setAIConsented(true);
    setShowAIDisclosure(false);
  };

  const handleAIConsentDecline = () => {
    // Allow limited functionality without AI features
    setAIConsented(false);
    setShowAIDisclosure(false);
    // Could redirect to a limited mode or show a warning
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    setShowUserProfile(false);
    setShowChatHistory(false);
    setActivePanel('home');
  };

  const handleOpenUserProfile = () => {
    setShowChatHistory(false); // Close chat history when opening user profile
    setShowUserProfile(true);
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
        return (
          <ChatPanel
            onStartEmail={handleStartEmail}
            onOpenDocument={handleOpenDocument}
            showHistorySidebar={showChatHistory}
            onToggleHistory={(show: boolean) => setShowChatHistory(show)}
          />
        );
      case 'image':
        return (
          <Suspense fallback={<PanelLoader />}>
            <DocumentAnalysisPanel />
          </Suspense>
        );
      case 'transcribe':
        return <TranscriptionPanel />;
      case 'email':
        return (
          <Suspense fallback={<PanelLoader />}>
            <EmailPanel emailContext={emailContext} onContextUsed={() => setEmailContext(null)} />
          </Suspense>
        );
      case 'maps':
        return <MapsPanel onOpenChat={() => setActivePanel('chat')} />;
      case 'live':
        return (
          <Suspense fallback={<PanelLoader />}>
            <LivePanel />
          </Suspense>
        );
      case 'knowledge':
        return (
          <Suspense fallback={<PanelLoader />}>
            <KnowledgePanel
              selectedDocument={selectedDocument}
              onDocumentViewed={() => setSelectedDocument(null)}
              onOpenInChat={(doc) => openChatWithDoc({ name: doc.name, path: doc.path })}
            />
          </Suspense>
        );
      case 'admin':
        return (
          <Suspense fallback={<PanelLoader />}>
            <AdminPanel />
          </Suspense>
        );
      case 'agnes':
        return (
          <Suspense fallback={<PanelLoader />}>
            <AgnesPanel onClose={() => setActivePanel('home')} />
          </Suspense>
        );
      case 'documentjob':
        return (
          <DocumentJobPanel
            onClose={() => setActivePanel('home')}
            onNavigateToChat={(context) => {
              localStorage.setItem('job_chat_context', context);
              setActivePanel('chat');
            }}
            onNavigateToEmail={(context) => {
              setEmailContext({ template: '', context: context });
              setActivePanel('email');
            }}
            onNavigateToUpload={() => setActivePanel('image')}
            onNavigateToInsurance={() => setActivePanel('maps')}
            onNavigateToKnowledge={() => setActivePanel('knowledge')}
          />
        );
      case 'learning':
        return <LearningDashboard />;
      case 'team':
        return (
          <MessagingPanel
            onClose={() => setActivePanel('home')}
          />
        );
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
            <img
              src="/roofer-s21-logo.webp"
              alt="ROOFER S21 - The Roof Docs"
            />
          </div>
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
              onClick={handleOpenUserProfile}
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
            onClick={handleOpenUserProfile}
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

      {/* AI Disclosure Modal */}
      {showAIDisclosure && (
        <AIDisclosureModal
          onAccept={handleAIConsentAccept}
          onDecline={handleAIConsentDecline}
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
            onQuickAction={(action) => {
              // Open modal for email to collect minimal context
              if (action === 'email') {
                setInitialQuickAction('email');
                setShowQuickActions(true);
                return;
              }
              if (action === 'transcribe') {
                setActivePanel('transcribe');
                return;
              }
              if (action === 'image') {
                setActivePanel('image');
                return;
              }
            }}
          />
        </div>

        <main className="flex-1">
          <ErrorBoundary>
            {renderPanel()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Floating Quick Action Button (mobile only) */}
      <button
        className="roof-er-floating-quick-action"
        aria-label="Open quick actions"
        onClick={() => { setInitialQuickAction('email'); setShowQuickActions(true); }}
      >
        + Quick Actions
      </button>

      {/* Quick Actions Modal */}
      <QuickActionModal
        isOpen={showQuickActions}
        initialAction={initialQuickAction}
        onClose={() => setShowQuickActions(false)}
        onStartEmail={({ template, context }) => handleStartEmail(template || '', context || '')}
        onGoTranscribe={() => setActivePanel('transcribe')}
        onGoUpload={() => setActivePanel('image')}
      />
    </div>
  );
};

export default App;
