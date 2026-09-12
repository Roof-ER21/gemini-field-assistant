
import React from 'react';
import { MotionConfig } from 'framer-motion';
import './src/polyfills/mediaRecorder';
import { installSessionFetch } from './src/auth/sessionToken';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import './styles/mobile-responsive.css';
import './src/field-experience.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

// Attach the session bearer to every API call before the app can fetch.
installSessionFetch();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
    </MotionConfig>
  </React.StrictMode>
);
