/**
 * Profile Page Entry Point
 * Standalone entry for public profile landing pages
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import ProfilePage from './ProfilePage';
import '../index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProfilePage />
  </React.StrictMode>
);
