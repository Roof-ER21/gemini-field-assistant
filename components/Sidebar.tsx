import React from 'react';
import { ChatIcon } from './icons/ChatIcon';
import { ImageIcon } from './icons/ImageIcon';
import { MicIcon } from './icons/MicIcon';
import { EmailIcon } from './icons/EmailIcon';
import { MapIcon } from './icons/MapIcon';
import { LiveIcon } from './icons/LiveIcon';
import { BookIcon } from './icons/BookIcon';

type PanelType = 'chat' | 'image' | 'transcribe' | 'email' | 'maps' | 'live' | 'knowledge';

interface SidebarProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePanel, setActivePanel }) => {
  const navItems = [
    { id: 'chat', label: 'Chat', icon: ChatIcon },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookIcon },
    { id: 'image', label: 'Image Analyzer', icon: ImageIcon },
    { id: 'transcribe', label: 'Transcribe Note', icon: MicIcon },
    { id: 'email', label: 'Email Generator', icon: EmailIcon },
    { id: 'maps', label: 'Maps Search', icon: MapIcon },
    { id: 'live', label: 'Live Conversation', icon: LiveIcon },
  ];

  return (
    <nav className="flex flex-col space-y-2">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setActivePanel(item.id as PanelType)}
          className={`flex items-center space-x-3 p-3 rounded-lg text-left transition-colors text-sm font-medium ${
            activePanel === item.id
              ? 'bg-red-700 text-white'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          <item.icon className="h-5 w-5" />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default Sidebar;
