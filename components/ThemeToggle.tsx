import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('theme') !== 'light';
  });

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [isDark]);

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="roof-er-header-btn"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
    >
      {isDark ? <Sun style={{ width: '16px', height: '16px' }} /> : <Moon style={{ width: '16px', height: '16px' }} />}
    </button>
  );
};

export default ThemeToggle;
