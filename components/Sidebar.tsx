import React from 'react';
import {
  Home,
  MessageSquare,
  BookOpen,
  Image,
  Mic,
  Mail,
  Building2,
  Radio,
  Upload
} from 'lucide-react';

type PanelType = 'home' | 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge';

interface SidebarProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePanel, setActivePanel }) => {
  const navItems = [
    { id: 'home', label: 'Home', desc: 'Dashboard', icon: Home },
    { id: 'chat', label: 'Chat', desc: 'AI conversation', icon: MessageSquare },
    { id: 'knowledge', label: 'Knowledge Base', desc: 'Documents & guides', icon: BookOpen },
    { id: 'image', label: 'Image Analysis', desc: 'Roof damage detection', icon: Image },
    { id: 'transcribe', label: 'Transcription', desc: 'Voice to text', icon: Mic },
    { id: 'email', label: 'Email', desc: 'Generate emails', icon: Mail },
    { id: 'maps', label: 'Insurance Co', desc: 'Insurance directory', icon: Building2 },
    { id: 'live', label: 'Live', desc: 'Real-time mode', icon: Radio },
  ];

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

          return (
            <div
              key={item.id}
              onClick={() => setActivePanel(item.id as PanelType)}
              className={`roof-er-nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="roof-er-nav-item-icon">
                <Icon className="w-5 h-5" />
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
              onClick={() => setActivePanel(action.id as PanelType)}
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
