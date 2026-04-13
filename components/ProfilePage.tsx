import React, { useState, lazy, Suspense } from 'react';
import { User, QrCode, Bell } from 'lucide-react';
import UserProfile from './UserProfile';
import { authService } from '../services/authService';

const MyProfilePanel = lazy(() => import('./MyProfilePanel'));
const NotificationsPage = lazy(() => import('./NotificationsPage'));

type Tab = 'profile' | 'qr' | 'notifications';

interface ProfilePageProps {
  onLogout: () => void;
  defaultTab?: Tab;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ onLogout, defaultTab = 'profile' }) => {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const currentUser = authService.getCurrentUser();

  const tabs = [
    { id: 'profile' as Tab, label: 'Profile', icon: User },
    { id: 'qr' as Tab, label: 'QR Code', icon: QrCode },
    { id: 'notifications' as Tab, label: 'Notifications', icon: Bell },
  ];

  const skeleton = (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: i === 1 ? '48px' : '72px',
          borderRadius: '12px',
          background: 'var(--bg-secondary)',
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 1 - (i * 0.15),
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.7 } }`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: isActive ? '2px solid var(--roof-red)' : '2px solid var(--border-subtle)',
                background: isActive ? 'var(--roof-red)' : 'var(--bg-secondary)',
                color: isActive ? 'white' : 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'profile' && (
          <UserProfile
            inline
            onClose={() => {}}
            onLogout={onLogout}
            defaultTab="profile"
          />
        )}

        {activeTab === 'qr' && (
          <Suspense fallback={skeleton}>
            <MyProfilePanel userEmail={currentUser?.email || ''} />
          </Suspense>
        )}

        {activeTab === 'notifications' && (
          <Suspense fallback={skeleton}>
            <NotificationsPage />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
