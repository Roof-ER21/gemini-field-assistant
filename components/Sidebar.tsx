import React, { useState, useEffect, useMemo } from 'react';
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
  Users,
  TrendingUp,
  MapPin,
  AlertTriangle,
  Cloud,
  Trophy,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Wrench,
  HardHat,
  Medal,
  Bot,
  Globe,
  QrCode,
  Presentation
} from 'lucide-react';
import { authService } from '../services/authService';
import { messagingService } from '../services/messagingService';
import NotificationBell from './NotificationBell';
import { useSettings, FeatureFlags } from '../contexts/SettingsContext';

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge' | 'admin' | 'agnes' | 'agnes-learning' | 'translator' | 'documentjob' | 'team' | 'learning' | 'canvassing' | 'impacted' | 'territories' | 'stormmap' | 'leaderboard' | 'contests' | 'myprofile' | 'inspections';
type QuickActionType = 'email' | 'stormmap' | 'leaderboard';

interface SidebarProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  onQuickAction?: (action: QuickActionType) => void;
}

interface NavItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  defaultExpanded: boolean;
}

// Custom Egyptian Pyramid S21 Icon Component
const S21Icon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Pyramid base */}
    <path
      d="M12 3L22 21H2L12 3Z"
      fill="url(#pyramid-gradient)"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Pyramid details - Egyptian stepped effect */}
    <path
      d="M12 3L18 15H6L12 3Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      opacity="0.4"
    />
    <path
      d="M12 3L15 10H9L12 3Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      opacity="0.3"
    />
    {/* S21 text */}
    <text
      x="12"
      y="18.5"
      fontFamily="sans-serif"
      fontSize="6"
      fontWeight="bold"
      fill="#1a1a1a"
      textAnchor="middle"
    >
      S21
    </text>
    {/* Gradient definition */}
    <defs>
      <linearGradient id="pyramid-gradient" x1="12" y1="3" x2="12" y2="21" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
      </linearGradient>
    </defs>
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({ activePanel, setActivePanel, onQuickAction }) => {
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['main', 'team']));
  const { features, isFeatureEnabled } = useSettings();

  // Map panel IDs to feature flag keys
  const featureFlagMap: Partial<Record<PanelType, keyof FeatureFlags>> = {
    chat: 'feature_susan_chat',
    leaderboard: 'feature_leaderboard',
    territories: 'feature_territories',
    stormmap: 'feature_storm_map',
    canvassing: 'feature_canvassing',
    impacted: 'feature_impacted_assets',
    live: 'feature_live',
    agnes: 'feature_agnes',
    'agnes-learning': 'feature_agnes'
  };

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

  // Define all nav items
  const allNavItems = useMemo(() => [
    { id: 'home', label: 'Home', desc: 'Dashboard', icon: Home },
    { id: 'chat', label: 'Susan 21', desc: 'AI conversation', icon: S21Icon },
    { id: 'team', label: 'Team', desc: 'Message colleagues', icon: Users, badge: unreadCount },
    { id: 'learning', label: 'Susan 21 Learning', desc: 'Team feedback', icon: TrendingUp },
    { id: 'agnes-learning', label: 'Agnes 21', desc: 'Roleplay training', icon: Bot },
    { id: 'translator', label: 'Pocket Linguist', desc: 'Translate + close deals', icon: Globe },
    { id: 'leaderboard', label: 'Leaderboard', desc: 'Sales rankings', icon: Trophy },
    { id: 'contests', label: 'Contests', desc: 'Sales competitions', icon: Medal },
    { id: 'knowledge', label: 'Knowledge Base', desc: 'Documents & guides', icon: BookOpen },
    { id: 'image', label: 'Upload Analysis', desc: 'Docs & photos review', icon: Image },
    { id: 'inspections', label: 'Inspection Presentations', desc: 'Build roof presentations', icon: Presentation },
    { id: 'transcribe', label: 'Transcription', desc: 'Voice to text', icon: Mic },
    { id: 'email', label: 'Email', desc: 'Generate emails', icon: Mail },
    { id: 'documentjob', label: 'Jobs', desc: 'Manage your jobs', icon: Briefcase },
    { id: 'maps', label: 'Hail & Insurance', desc: 'Hail history + directory', icon: Building2 },
    { id: 'territories', label: 'Territories', desc: 'Manage sales areas', icon: MapPin },
    { id: 'stormmap', label: 'Storm Map', desc: 'Hail history by region', icon: Cloud },
    { id: 'canvassing', label: 'Canvassing', desc: 'Track door knocking', icon: MapPin },
    { id: 'impacted', label: 'Impacted Assets', desc: 'Customer storm alerts', icon: AlertTriangle },
    { id: 'live', label: 'Live', desc: 'Real-time mode', icon: Radio },
    // QR Profile - admin only until rollout
    ...(isAdmin ? [{ id: 'myprofile', label: 'QR Profiles', desc: 'Public landing pages', icon: QrCode }] : []),
    // Admin panel - will be filtered by isAdmin check below
    ...(isAdmin ? [{ id: 'admin', label: 'Admin Panel', desc: 'System settings', icon: Shield }] : [])
  ], [unreadCount, isAdmin]);

  // Filter nav items based on feature flags
  const navItems = useMemo(() => {
    return allNavItems.filter(item => {
      const panelId = item.id as PanelType;
      const featureKey = featureFlagMap[panelId];

      // If no feature flag is mapped, always show the item
      if (!featureKey) return true;

      // Check if the feature is enabled
      return isFeatureEnabled(featureKey);
    });
  }, [allNavItems, features, isFeatureEnabled]);

  // Group nav items into categories
  const navCategories = useMemo((): NavCategory[] => {
    const itemsMap = new Map(navItems.map(item => [item.id, item]));

    const categories: NavCategory[] = [
      {
        id: 'main',
        label: 'Main',
        icon: Sparkles,
        defaultExpanded: true,
        items: ['home', 'chat', 'agnes-learning', 'translator']
          .map(id => itemsMap.get(id))
          .filter((item): item is NavItem => !!item)
      },
      {
        id: 'team',
        label: 'Team',
        icon: Users,
        defaultExpanded: true,
        items: ['team', 'learning', 'leaderboard', 'contests']
          .map(id => itemsMap.get(id))
          .filter((item): item is NavItem => !!item)
      },
      {
        id: 'tools',
        label: 'Tools',
        icon: Wrench,
        defaultExpanded: false,
        items: ['email', 'transcribe', 'image', 'inspections', 'knowledge', 'myprofile']
          .map(id => itemsMap.get(id))
          .filter((item): item is NavItem => !!item)
      },
      {
        id: 'field-ops',
        label: 'Field Ops',
        icon: HardHat,
        defaultExpanded: false,
        items: ['documentjob', 'territories', 'canvassing']
          .map(id => itemsMap.get(id))
          .filter((item): item is NavItem => !!item)
      },
      {
        id: 'storm-intel',
        label: 'Storm Intel',
        icon: Cloud,
        defaultExpanded: false,
        items: ['stormmap', 'maps', 'impacted']
          .map(id => itemsMap.get(id))
          .filter((item): item is NavItem => !!item)
      },
      {
        id: 'other',
        label: 'Other',
        icon: Radio,
        defaultExpanded: false,
        items: ['live', 'admin']
          .map(id => itemsMap.get(id))
          .filter((item): item is NavItem => !!item)
      }
    ];

    // Filter out empty categories
    return categories.filter(cat => cat.items.length > 0);
  }, [navItems]);

  // Auto-expand category containing active panel
  useEffect(() => {
    const activeCategoryId = navCategories.find(cat =>
      cat.items.some(item => item.id === activePanel)
    )?.id;

    if (activeCategoryId && !expandedCategories.has(activeCategoryId)) {
      setExpandedCategories(prev => new Set([...prev, activeCategoryId]));
    }
  }, [activePanel, navCategories]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const quickActions = [
    { id: 'email', title: 'Email', desc: 'Quick email draft', icon: Mail },
    { id: 'stormmap', title: 'Storm Map', desc: 'Hail history', icon: Cloud },
    { id: 'leaderboard', title: 'Leaderboard', desc: 'Sales rankings', icon: Trophy }
  ];

  return (
    <div className="roof-er-sidebar">
      {/* Notification Bell - Top Right */}
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}>
        <NotificationBell />
      </div>

      {/* Navigation Section */}
      <div className="roof-er-sidebar-section">
        <div className="roof-er-sidebar-title">Navigation</div>
        {navCategories.map((category) => {
          const CategoryIcon = category.icon;
          const isExpanded = expandedCategories.has(category.id);
          const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

          return (
            <div key={category.id} style={{ marginBottom: '0.5rem' }}>
              {/* Category Header */}
              <div
                onClick={() => toggleCategory(category.id)}
                className="roof-er-nav-category-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  marginBottom: '0.25rem',
                  transition: 'all 0.2s ease',
                  userSelect: 'none'
                }}
              >
                <ChevronIcon className="w-4 h-4" style={{ marginRight: '0.5rem', opacity: 0.7 }} />
                <CategoryIcon className="w-4 h-4" style={{ marginRight: '0.5rem', opacity: 0.7 }} />
                <span style={{ fontSize: '0.8rem', fontWeight: '600', opacity: 0.8 }}>
                  {category.label}
                </span>
              </div>

              {/* Category Items */}
              <div
                style={{
                  maxHeight: isExpanded ? '1000px' : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease',
                  opacity: isExpanded ? 1 : 0
                }}
              >
                {category.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePanel === item.id;
                  const badge = item.badge;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setActivePanel(item.id as PanelType)}
                      className={`roof-er-nav-item ${isActive ? 'active' : ''}`}
                      style={{
                        marginLeft: '1.5rem'
                      }}
                    >
                      <div className="roof-er-nav-item-icon" style={{ position: 'relative' }}>
                        <Icon className="w-5 h-5" />
                        {badge !== undefined && badge > 0 && (
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
                if (action.id === 'email' && onQuickAction) {
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
