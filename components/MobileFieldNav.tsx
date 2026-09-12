import React from 'react';
import { Home, MessageSquare, Globe, User, Menu } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

type Destination = 'home' | 'chat' | 'translator' | 'myprofile';
export default function MobileFieldNav({
  activePanel,
  menuOpen,
  onNavigate,
  onMenu,
}: {
  activePanel: string;
  menuOpen: boolean;
  onNavigate: (panel: Destination) => void;
  onMenu: () => void;
}) {
  const { isFeatureEnabled } = useSettings();
  const destinations = [
    { id: 'home' as const, label: 'Home', icon: Home },
    ...(isFeatureEnabled('feature_susan_chat')
      ? [{ id: 'chat' as const, label: 'Susan', icon: MessageSquare }]
      : []),
    { id: 'translator' as const, label: 'Translate', icon: Globe },
    { id: 'myprofile' as const, label: 'Profile', icon: User },
  ];
  return (
    <nav className="field-mobile-nav" aria-label="Primary navigation">
      {destinations.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={!menuOpen && activePanel === id ? 'page' : undefined}
          onClick={() => onNavigate(id)}
        >
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onMenu}
        aria-expanded={menuOpen}
        aria-controls="field-navigation"
        className={menuOpen ? 'is-selected' : ''}
      >
        <Menu size={21} aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
