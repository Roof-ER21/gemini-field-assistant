import React, { useState, useEffect, lazy } from 'react';
import Sidebar from './components/Sidebar';
import HomePage from './components/HomePageRedesigned';
import ChatPanel from './components/ChatPanel';
import TranscriptionPanel from './components/TranscriptionPanel';
import DocumentJobPanel from './components/DocumentJobPanel';
import LoginPage from './components/LoginPage';
import AIDisclosureModal, { hasAIConsent } from './components/AIDisclosureModal';
import WelcomeModal from './components/WelcomeModal';
import MessagingPanel from './components/MessagingPanel';
import TeamKnowledgeHub from './components/TeamKnowledgeHub';
import { authService, AuthUser } from './services/authService';
import memoryService from './services/memoryService';
import { Menu, X } from 'lucide-react';
import NotificationBell from './components/NotificationBell';
import ThemeToggle from './components/ThemeToggle';
import ErrorBoundary from './components/ErrorBoundary';
import LazyLoadBoundary from './components/LazyLoadBoundary';
import IncomingCallModal from './components/IncomingCallModal';
import { SettingsProvider } from './contexts/SettingsContext';
import { DivisionProvider, useDivision } from './contexts/DivisionContext';
import DivisionSelectorModal from './components/DivisionSelectorModal';

// Lazy load heavy panels for better performance
const EmailPanel = lazy(() => import('./components/EmailPanel'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const DocumentAnalysisPanel = lazy(() => import('./components/DocumentAnalysisPanel'));
const KnowledgePanel = lazy(() => import('./components/KnowledgePanel'));
const KnowledgeHub = lazy(() => import('./components/KnowledgeHub'));
const AgnesPanel = lazy(() => import('./components/AgnesPanel'));
const AgnesLearningPanel = lazy(() => import('./components/AgnesLearningPanel'));
const TranslatorPanel = lazy(() => import('./components/TranslatorPanel'));
const LivePanel = lazy(() => import('./components/LivePanel'));
const CanvassingPanel = lazy(() => import('./components/CanvassingPanel'));
const ImpactedAssetsPanel = lazy(() => import('./components/ImpactedAssetsPanel'));
const TerritoryManager = lazy(() => import('./components/TerritoryManager'));
const TerritoryHailMap = lazy(() => import('./components/TerritoryHailMap'));
const LeaderboardPanel = lazy(() => import('./components/LeaderboardPanel'));
const ContestSection = lazy(() => import('./src/components/ContestSection'));
const MyProfilePanel = lazy(() => import('./components/MyProfilePanel'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const InspectionPresentationPanel = lazy(() => import('./components/InspectionPresentationPanel'));
const NotificationsPage = lazy(() => import('./components/NotificationsPage'));
const CalendarPanel = lazy(() => import('./components/CalendarPanel'));
const DeafCommunicationPanel = lazy(() => import('./components/DeafCommunicationPanel'));

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'live' | 'knowledge' | 'admin' | 'agnes' | 'agnes-learning' | 'translator' | 'documentjob' | 'team' | 'learning' | 'canvassing' | 'impacted' | 'territories' | 'stormmap' | 'leaderboard' | 'contests' | 'myprofile' | 'inspections' | 'notifications' | 'calendar' | 'deaf-mode';

/** Admin-only toggle to switch division view for testing */
const AdminDivisionToggle: React.FC = () => {
  const user = authService.getCurrentUser();
  const { division, setDivision, isRetail } = useDivision();

  if (!user || user.role !== 'admin') return null;

  return (
    <button
      onClick={() => setDivision(isRetail ? 'insurance' : 'retail')}
      title={`Viewing as: ${division}. Click to switch.`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 10px',
        borderRadius: '20px',
        border: `1px solid ${isRetail ? '#3b82f6' : '#dc2626'}`,
        background: isRetail ? 'rgba(59,130,246,0.15)' : 'rgba(220,38,38,0.15)',
        color: isRetail ? '#60a5fa' : '#f87171',
        fontSize: '11px',
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: '0.05em',
        transition: 'all 0.2s',
      }}
    >
      <div style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: isRetail ? '#3b82f6' : '#dc2626',
      }} />
      {isRetail ? 'RET' : 'INS'}
    </button>
  );
};

/** Small gate component — shows division selector only for truly new users */
const DivisionGate: React.FC = () => {
  const { hasDivision, setDivision } = useDivision();
  const user = authService.getCurrentUser();

  // Don't show if no user logged in, or division already set
  if (!user || hasDivision) return null;

  // Existing users (created before the division update) → auto-set to insurance silently
  // Only show the selector for brand new accounts created after this update
  const userCreatedAt = user.created_at ? new Date(user.created_at).getTime() : 0;
  const divisionLaunchDate = new Date('2026-04-13').getTime();
  if (userCreatedAt < divisionLaunchDate) {
    // Silently set existing users to insurance — no popup
    setDivision('insurance');
    return null;
  }

  return (
    <DivisionSelectorModal
      onSelect={async (division) => {
        await setDivision(division);
      }}
    />
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType>('home');
  const [emailContext, setEmailContext] = useState<{template: string; context: string} | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showAIDisclosure, setShowAIDisclosure] = useState(false);
  const [aiConsented, setAIConsented] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      switch (detail.type) {
        case 'system':
          if (detail.notification?.data?.feedback_id) {
            setActivePanel('learning');
          } else {
            setActivePanel('myprofile');
          }
          break;
        case 'mention':
        case 'direct_message':
          setActivePanel('team');
          break;
        case 'shared_content':
          setActivePanel('chat');
          break;
        default:
          setActivePanel('myprofile');
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

  // Apply saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
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
    live: 'Live Conversation',
    admin: 'Admin Panel',
    agnes: 'Agnes - Objection Handler',
    'agnes-learning': 'Agnes 21 Learning',
    translator: 'Agnes Translator',
    documentjob: 'Document Job',
    learning: 'Team Knowledge',
    canvassing: 'Canvassing Tracker',
    impacted: 'Impacted Assets',
    territories: 'Territory Management',
    stormmap: 'Storm Maps',
    leaderboard: 'Leaderboard',
    contests: 'Sales Contests',
    myprofile: 'My QR Profile',
    inspections: 'Inspection Presentations',
    notifications: 'Notifications',
    calendar: 'Calendar',
    'deaf-mode': 'Deaf Communication'
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

  const handleLoginSuccess = async () => {
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

      // Check if this is first login and show welcome modal
      // Only show if AI disclosure is NOT being shown (welcome comes after consent)
      // Use session storage to prevent showing multiple times per session
      const hasShownWelcomeThisSession = sessionStorage.getItem('welcome_shown');

      if (!hasShownWelcomeThisSession && consent) {
        // Only show welcome if user already has AI consent
        try {
          const nickname = await memoryService.getUserNickname();
          const firstLogin = !nickname; // If no nickname, it's first login

          setIsFirstLogin(firstLogin);
          setShowWelcome(true);

          // Mark as shown in session storage
          sessionStorage.setItem('welcome_shown', 'true');
        } catch (error) {
          console.error('Error checking nickname:', error);
        }
      }
      // If no consent, welcome modal will show after AI disclosure is accepted
    }
  };

  const handleAIConsentAccept = async () => {
    setAIConsented(true);
    setShowAIDisclosure(false);

    // Now show welcome modal if not shown this session
    const hasShownWelcomeThisSession = sessionStorage.getItem('welcome_shown');
    if (!hasShownWelcomeThisSession) {
      try {
        const nickname = await memoryService.getUserNickname();
        const firstLogin = !nickname;
        setIsFirstLogin(firstLogin);
        setShowWelcome(true);
        sessionStorage.setItem('welcome_shown', 'true');
      } catch (error) {
        console.error('Error checking nickname:', error);
      }
    }
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
    setShowChatHistory(false);
    setActivePanel('home');
  };

  const handleOpenUserProfile = () => {
    setShowChatHistory(false);
    setActivePanel('myprofile');
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const renderPanel = () => {
    switch (activePanel) {
      case 'home':
        return <HomePage setActivePanel={setActivePanel} userEmail={currentUser?.email} />;
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
          <LazyLoadBoundary componentName="Document Analysis">
            <DocumentAnalysisPanel />
          </LazyLoadBoundary>
        );
      case 'transcribe':
        return <TranscriptionPanel />;
      case 'email':
        return (
          <LazyLoadBoundary componentName="Email Generator">
            <EmailPanel emailContext={emailContext} onContextUsed={() => setEmailContext(null)} />
          </LazyLoadBoundary>
        );
      case 'live':
        return (
          <LazyLoadBoundary componentName="Live Conversation">
            <LivePanel />
          </LazyLoadBoundary>
        );
      case 'knowledge':
        return (
          <LazyLoadBoundary componentName="Knowledge Base">
            <KnowledgeHub
              selectedDocument={selectedDocument}
              onDocumentViewed={() => setSelectedDocument(null)}
              onOpenInChat={(doc) => openChatWithDoc({ name: doc.name, path: doc.path })}
            />
          </LazyLoadBoundary>
        );
      case 'admin':
        return (
          <LazyLoadBoundary componentName="Admin Panel">
            <AdminPanel />
          </LazyLoadBoundary>
        );
      case 'agnes':
        return (
          <LazyLoadBoundary componentName="Agnes Training">
            <AgnesPanel onClose={() => setActivePanel('home')} />
          </LazyLoadBoundary>
        );
      case 'agnes-learning':
        return (
          <LazyLoadBoundary componentName="Agnes Learning">
            <AgnesLearningPanel />
          </LazyLoadBoundary>
        );
      case 'translator':
        return (
          <LazyLoadBoundary componentName="Translator">
            <TranslatorPanel />
          </LazyLoadBoundary>
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
            onNavigateToInsurance={() => setActivePanel('knowledge')}
            onNavigateToKnowledge={() => setActivePanel('knowledge')}
          />
        );
      case 'learning':
        return (
          <LazyLoadBoundary componentName="Team Knowledge">
            <KnowledgeHub
              selectedDocument={selectedDocument}
              onDocumentViewed={() => setSelectedDocument(null)}
              onOpenInChat={(doc) => openChatWithDoc({ name: doc.name, path: doc.path })}
            />
          </LazyLoadBoundary>
        );
      case 'team':
        return (
          <MessagingPanel
            onClose={() => setActivePanel('home')}
          />
        );
      case 'canvassing':
        return (
          <LazyLoadBoundary componentName="Canvassing">
            <CanvassingPanel />
          </LazyLoadBoundary>
        );
      case 'impacted':
        return (
          <LazyLoadBoundary componentName="Impacted Assets">
            <ImpactedAssetsPanel />
          </LazyLoadBoundary>
        );
      case 'territories':
        return (
          <LazyLoadBoundary componentName="Territory Manager">
            <TerritoryManager />
          </LazyLoadBoundary>
        );
      case 'stormmap':
        return (
          <LazyLoadBoundary componentName="Storm Map">
            <TerritoryHailMap isAdmin={currentUser?.role === 'admin'} />
          </LazyLoadBoundary>
        );
      case 'leaderboard':
        return (
          <LazyLoadBoundary componentName="Leaderboard">
            <LeaderboardPanel userEmail={currentUser?.email || ''} />
          </LazyLoadBoundary>
        );
      case 'contests':
        return (
          <LazyLoadBoundary componentName="Contests">
            <ContestSection userEmail={currentUser?.email || ''} userRole={currentUser?.role || 'user'} />
          </LazyLoadBoundary>
        );
      case 'myprofile':
        return (
          <LazyLoadBoundary componentName="My Profile">
            <ProfilePage onLogout={handleLogout} />
          </LazyLoadBoundary>
        );
      case 'inspections':
        return (
          <LazyLoadBoundary componentName="Inspection Presentations">
            <InspectionPresentationPanel />
          </LazyLoadBoundary>
        );
      case 'notifications':
        return (
          <LazyLoadBoundary componentName="Notifications">
            <NotificationsPage userEmail={currentUser?.email} />
          </LazyLoadBoundary>
        );
      case 'calendar':
        return (
          <LazyLoadBoundary componentName="Calendar">
            <CalendarPanel />
          </LazyLoadBoundary>
        );
      case 'deaf-mode':
        return (
          <LazyLoadBoundary componentName="Deaf Communication">
            <DeafCommunicationPanel />
          </LazyLoadBoundary>
        );
      default:
        return <HomePage setActivePanel={setActivePanel} userEmail={currentUser?.email} />;
    }
  };

  return (
    <SettingsProvider>
    <DivisionProvider>
    <div className="roof-er-app-shell flex flex-col" style={{ background: 'var(--bg-primary)', height: '100dvh', minHeight: '100dvh' }}>
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
              alt="RoofER"
            />
          </div>
          <div className="roof-er-brand-title" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
            <span className="roof-er-brand-name" style={{ fontSize: '18px' }}>Susan <span className="roof-er-brand-accent">21</span></span>
            <span style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--text-tertiary)', fontWeight: 600, alignSelf: 'center' }}>S21</span>
          </div>
          <div className="roof-er-page-subtitle">{pageTitles[activePanel]}</div>
        </div>
        <div className="roof-er-header-actions">
          {/* AI Status Pulse */}
          <div
            className="roof-er-status-badge"
            style={{ cursor: 'default', gap: '6px' }}
            title="Susan AI, Agnes AI, Pocket Linguist, Storm Intel"
          >
            <div style={{
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
            }}>
              {['#dc2626', '#3b82f6', '#10b981', '#8b5cf6'].map((color, i) => (
                <div key={i} style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 6px ${color}`,
                  animation: `pulse-dot 2s ease-in-out ${i * 0.3}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: '12px' }}>4 AI</span>
            <style>{`@keyframes pulse-dot { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.4); } }`}</style>
          </div>

          {/* Admin Division Toggle */}
          <AdminDivisionToggle />

          <NotificationBell onViewAll={() => { setActivePanel('myprofile'); }} />
          <ThemeToggle />

          {/* Avatar → Profile */}
          {currentUser && (
            <div
              onClick={handleOpenUserProfile}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 700,
                color: 'white',
                border: '2px solid var(--border-subtle)',
                transition: 'all 0.2s',
              }}
              title={`${currentUser.name} — Profile & Settings`}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </header>

      {/* Division Selector — shows once on first login if no division set */}
      <DivisionGate />

      {/* AI Disclosure Modal */}
      {showAIDisclosure && (
        <AIDisclosureModal
          onAccept={handleAIConsentAccept}
          onDecline={handleAIConsentDecline}
        />
      )}

      {/* Welcome Modal */}
      {showWelcome && (
        <WelcomeModal
          isFirstLogin={isFirstLogin}
          onComplete={() => setShowWelcome(false)}
        />
      )}

      {/* Incoming Call Modal (global overlay, polls for 1:1 calls) */}
      <IncomingCallModal
        onAccept={(call) => {
          setActivePanel('team');
          window.dispatchEvent(new CustomEvent('livekit-call-accepted', { detail: call }));
        }}
      />

      {/* Main Content */}
      <div className="roof-er-main-layout flex flex-1" style={{ minWidth: 0, overflow: 'hidden', minHeight: 0, maxHeight: '100%' }}>
        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
          <div
            className="roof-er-mobile-overlay"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar with mobile support */}
        <div className={`roof-er-sidebar-wrapper ${isMobileMenuOpen ? 'mobile-open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <Sidebar
            activePanel={activePanel}
            collapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((previous) => !previous)}
            setActivePanel={(panel) => {
              setActivePanel(panel);
              setIsMobileMenuOpen(false); // Close menu when item is selected
            }}
          />
        </div>

        <main className="roof-er-main-panel flex-1" style={{ minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ErrorBoundary>
            {renderPanel()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Floating Quick Action Button (mobile only) - Hidden on chat panel */}
      {activePanel !== 'chat' && (
        <button
          className="roof-er-floating-quick-action"
          aria-label="Open quick actions"
          onClick={() => setActivePanel('email')}
        >
          + Quick Actions
        </button>
      )}

    </div>
    </DivisionProvider>
    </SettingsProvider>
  );
};

export default App;
