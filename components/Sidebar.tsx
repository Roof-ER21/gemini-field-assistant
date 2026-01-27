import React, { useState, useEffect } from 'react';
import {
  Home,
  MessageSquare,
  BookOpen,
  Image,
  Mic,
  Mail,
  Building2,
  Radio,
  Upload,
  Shield,
  Briefcase,
  Users
} from 'lucide-react';
import { authService } from '../services/authService';
import { messagingService } from '../services/messagingService';

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge' | 'admin' | 'agnes' | 'documentjob' | 'team';
type QuickActionType = 'email' | 'transcribe' | 'image';

interface SidebarProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  onQuickAction?: (action: QuickActionType) => void;
}

// Custom S21 Triangle Icon Component
const S21Icon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 4L20 20H4L12 4Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <text
      x="12"
      y="17"
      fontFamily="sans-serif"
      fontSize="7"
      fontWeight="bold"
      fill="#000000"
      textAnchor="middle"
    >
      S21
    </text>
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ activePanel, setActivePanel, onQuickAction }) => {
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread message count
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const data = await messagingService.getUnreadCount();
        setUnreadCount(data.total_unread);
      } catch (e) {
        console.error('Error fetching unread count:', e);
      }
    };

    fetchUnread();

    // Poll every 30 seconds for new messages
    const interval = setInterval(fetchUnread, 30000);

    // Also listen for real-time updates
    messagingService.connect();
    const unsub = messagingService.onNewMessage(() => {
      fetchUnread();
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  const navItems = [
    { id: 'home', label: 'Home', desc: 'Dashboard', icon: Home },
    { id: 'chat', label: 'Chat', desc: 'AI conversation', icon: S21Icon },
    { id: 'team', label: 'Team', desc: 'Message colleagues', icon: Users, badge: unreadCount },
    { id: 'knowledge', label: 'Knowledge Base', desc: 'Documents & guides', icon: BookOpen },
    { id: 'image', label: 'Upload Analysis', desc: 'Docs & photos review', icon: Image },
    { id: 'transcribe', label: 'Transcription', desc: 'Voice to text', icon: Mic },
    { id: 'email', label: 'Email', desc: 'Generate emails', icon: Mail },
    { id: 'documentjob', label: 'Jobs', desc: 'Manage your jobs', icon: Briefcase },
    { id: 'maps', label: 'Insurance Co', desc: 'Insurance directory', icon: Building2 },
    { id: 'live', label: 'Live', desc: 'Real-time mode', icon: Radio },
  ];

  // Add admin item only if user is admin
  if (isAdmin) {
    navItems.push({
      id: 'admin',
      label: 'Admin Panel',
      desc: 'User conversations',
      icon: Shield
    });
  }

  const quickActions = [
    { id: 'email', title: 'Email', desc: 'Quick email draft', icon: Mail },
    { id: 'transcribe', title: 'Voice Note', desc: 'Record & transcribe', icon: Mic },
    { id: 'image', title: 'Upload', desc: 'Quick file upload', icon: Upload }
  ];

  return (
    <div className="roof-er-sidebar">
      {/* Navigation Section */}
      <div className="roof-er-sidebar-section">
        <div className="roof-er-sidebar-title">Navigation</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePanel === item.id;
          const badge = (item as any).badge;

          return (
            <div
              key={item.id}
              onClick={() => setActivePanel(item.id as PanelType)}
              className={`roof-er-nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="roof-er-nav-item-icon" style={{ position: 'relative' }}>
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      background: 'var(--roof-red)',
                      color: 'white',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      minWidth: '16px',
                      height: '16px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px'
                    }}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <div className="roof-er-nav-item-content">
                <div className="roof-er-nav-item-title">{item.label}</div>
                <div className="roof-er-nav-item-desc">{item.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions Section */}
      <div className="roof-er-sidebar-section">
        <div className="roof-er-sidebar-title">Quick Actions</div>
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <div
              key={action.id}
              onClick={() => {
                if (onQuickAction) {
                  onQuickAction(action.id as QuickActionType);
                } else {
                  setActivePanel(action.id as PanelType);
                }
              }}
              className="roof-er-action-card"
              style={{ cursor: 'pointer' }}
            >
              <div className="roof-er-action-card-title">
                <Icon className="w-4 h-4 inline mr-1" />
                {action.title}
              </div>
              <div className="roof-er-action-card-desc">{action.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Sidebar;
