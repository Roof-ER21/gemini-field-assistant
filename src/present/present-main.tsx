/**
 * Presentation Viewer Entry Point
 * Standalone entry for public presentation viewing
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import PresentationViewer from './PresentationViewer';
import '../index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PresentationViewer />
  </React.StrictMode>
);
