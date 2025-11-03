import React from 'react';
import {
  MessageSquare,
  BookOpen,
  Image,
  Mic,
  Mail,
  Building2,
  Radio,
  Target,
  FileText,
  DollarSign
} from 'lucide-react';

type PanelType = 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge';

interface SidebarProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePanel, setActivePanel }) => {
  const navItems = [
    { id: 'chat', label: 'Chat', desc: 'AI conversation', icon: MessageSquare },
    { id: 'knowledge', label: 'Knowledge Base', desc: 'Documents & guides', icon: BookOpen },
    { id: 'image', label: 'Image Analysis', desc: 'Roof damage detection', icon: Image },
    { id: 'transcribe', label: 'Transcription', desc: 'Voice to text', icon: Mic },
    { id: 'email', label: 'Email', desc: 'Generate emails', icon: Mail },
    { id: 'maps', label: 'Insurance Co', desc: 'Insurance directory', icon: Building2 },
    { id: 'live', label: 'Live', desc: 'Real-time mode', icon: Radio },
  ];

  const quickActions = [
    { title: 'Handle Objection', desc: 'Get response scripts', icon: Target },
    { title: 'Document Job', desc: 'Create job report', icon: FileText },
    { title: 'Price Quote', desc: 'Generate estimate', icon: DollarSign }
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
        {quickActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <div key={index} className="roof-er-action-card">
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
