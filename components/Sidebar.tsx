import React, { useState, useEffect, useMemo } from 'react';
import {
  Home,
  MessageSquare,
  BookOpen,
  Image,
  Mic,
  Mail,
  Radio,
  Ear,
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
  Presentation,
  Calendar,
  User
} from 'lucide-react';
import { authService } from '../services/authService';
import { messagingService } from '../services/messagingService';
import { useSettings, FeatureFlags } from '../contexts/SettingsContext';
import { useDivision } from '../contexts/DivisionContext';

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'live' | 'knowledge' | 'admin' | 'agnes' | 'agnes-learning' | 'translator' | 'documentjob' | 'team' | 'learning' | 'canvassing' | 'impacted' | 'territories' | 'stormmap' | 'leaderboard' | 'contests' | 'myprofile' | 'inspections' | 'notifications' | 'calendar' | 'deaf-mode';
interface SidebarProps {
  activePanel: PanelType;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  setActivePanel: (panel: PanelType) => void;
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
    <path
      d="M12 3L22 21H2L12 3Z"
      fill="url(#pyramid-gradient)"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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
    <defs>
      <linearGradient id="pyramid-gradient" x1="12" y1="3" x2="12" y2="21" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
      </linearGradient>
    </defs>
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({
  activePanel,
  collapsed = false,
  onToggleCollapse,
  setActivePanel,
}) => {
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const { isRetail } = useDivision();
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['main', 'team', 'field-storm']));
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
    'agnes-learning': 'feature_agnes',
    'deaf-mode': 'feature_deaf_mode'
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
    const interval = setInterval(fetchUnread, 30000);
    messagingService.connect();
    const unsub = messagingService.onNewMessage(() => { fetchUnread(); });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  // All nav items — every panel in the system
  const allNavItems = useMemo((): NavItem[] => [
    { id: 'home', label: 'Home', desc: 'Dashboard', icon: Home },
    { id: 'chat', label: isRetail ? 'Susan 24' : 'Susan 21', desc: 'AI assistant', icon: S21Icon },
    { id: 'translator', label: 'Pocket Linguist', desc: 'Translate + close deals', icon: Globe },
    { id: 'team', label: 'Team', desc: 'Message colleagues', icon: Users, badge: unreadCount },
    { id: 'agnes-learning', label: isRetail ? 'Agnes 24' : 'Agnes 21', desc: 'Roleplay training', icon: Bot },
    { id: 'knowledge', label: 'Knowledge Base', desc: 'Documents & guides', icon: BookOpen },
    { id: 'stormmap', label: 'Storm Maps', desc: 'Hail history & radar', icon: Cloud },
    { id: 'impacted', label: 'Impacted Assets', desc: 'Customer storm alerts', icon: AlertTriangle },
    { id: 'myprofile', label: 'Profile', desc: 'QR code & settings', icon: User },
    // Admin-only items below
    { id: 'email', label: 'Email', desc: 'Generate emails', icon: Mail },
    { id: 'image', label: 'Upload Analysis', desc: 'Docs & photos review', icon: Image },
    { id: 'transcribe', label: 'Transcription', desc: 'Voice to text', icon: Mic },
    { id: 'documentjob', label: 'Jobs', desc: 'Manage your jobs', icon: Briefcase },
    { id: 'learning', label: 'Team Knowledge', desc: 'Learning & field intel', icon: TrendingUp },
    { id: 'leaderboard', label: 'Leaderboard', desc: 'Sales rankings', icon: Trophy },
    { id: 'contests', label: 'Contests', desc: 'Sales competitions', icon: Medal },
    { id: 'territories', label: 'Territories', desc: 'Manage sales areas', icon: MapPin },
    { id: 'canvassing', label: 'Canvassing', desc: 'Track door knocking', icon: MapPin },
    { id: 'inspections', label: 'Inspections', desc: 'Build presentations', icon: Presentation },
    { id: 'live', label: 'Live', desc: 'Real-time mode', icon: Radio },
    { id: 'deaf-mode', label: 'Deaf Communication', desc: 'Sign language + captions', icon: Ear },
    { id: 'admin', label: 'Admin Panel', desc: 'System settings', icon: Shield },
  ], [unreadCount, isRetail]);

  // Filter by feature flags
  const navItems = useMemo(() => {
    return allNavItems.filter(item => {
      const panelId = item.id as PanelType;
      const featureKey = featureFlagMap[panelId];
      if (!featureKey) return true;
      return isFeatureEnabled(featureKey);
    });
  }, [allNavItems, features, isFeatureEnabled]);

  // Build categories based on role
  const navCategories = useMemo((): NavCategory[] => {
    const itemsMap = new Map(navItems.map(item => [item.id, item]));
    const get = (ids: string[]) => ids.map(id => itemsMap.get(id)).filter((item): item is NavItem => !!item);

    const categories: NavCategory[] = [
      // ===== REP-VISIBLE CATEGORIES (adapt per division) =====
      {
        id: 'main',
        label: 'Main',
        icon: Sparkles,
        defaultExpanded: true,
        items: get(isRetail
          ? ['home', 'chat', 'translator']
          : ['home', 'chat', 'translator']),
      },
      {
        id: 'team',
        label: 'Team',
        icon: Users,
        defaultExpanded: true,
        items: get(isRetail
          ? ['team', 'agnes-learning', 'knowledge']
          : ['team', 'agnes-learning', 'knowledge']),
      },
      {
        id: 'field-storm',
        label: isRetail ? 'Field' : 'Field / Storm',
        icon: Cloud,
        defaultExpanded: true,
        items: get(isRetail
          ? ['myprofile']
          : ['stormmap', 'impacted', 'myprofile']),
      },
      // ===== ADMIN-ONLY CATEGORIES =====
      ...(isAdmin ? [{
        id: 'admin-tools',
        label: 'Admin Tools',
        icon: Shield as React.ComponentType<{ className?: string }>,
        defaultExpanded: false,
        items: get([
          'email', 'image', 'transcribe', 'documentjob', 'learning',
          'leaderboard', 'contests', 'territories', 'canvassing',
          'inspections', 'live', 'deaf-mode', 'admin',
        ]),
      }] : []),
    ];

    return categories.filter(cat => cat.items.length > 0);
  }, [navItems, isAdmin, isRetail]);

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

  return (
    <div className={`roof-er-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="roof-er-sidebar-topbar">
        {!collapsed ? <div className="roof-er-sidebar-title">Navigation</div> : <div className="roof-er-sidebar-title-spacer" />}
        <button
          type="button"
          className="roof-er-sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" style={{ transform: 'rotate(90deg)' }} />}
        </button>
      </div>

      {collapsed ? (
        <div className="roof-er-sidebar-collapsed-nav">
          {navCategories.map((category) => (
            <div key={category.id} className="roof-er-sidebar-collapsed-group">
              {category.items.map((item) => {
                const Icon = item.icon;
                const isActive = activePanel === item.id;
                const badge = item.badge;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActivePanel(item.id as PanelType)}
                    className={`roof-er-sidebar-icon-btn ${isActive ? 'active' : ''}`}
                    title={`${item.label} — ${item.desc}`}
                    aria-label={item.label}
                  >
                    <span className="roof-er-sidebar-icon-btn-inner">
                      <Icon className="w-5 h-5" />
                      {badge !== undefined && badge > 0 ? (
                        <span className="roof-er-sidebar-icon-badge">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="roof-er-sidebar-section">
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
                    background: 'var(--glass-highlight)',
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
      )}
    </div>
  );
};

export default Sidebar;
