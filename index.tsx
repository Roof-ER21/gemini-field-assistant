
import React from 'react';
import { installSessionFetch } from './src/auth/sessionToken';
import './src/polyfills/mediaRecorder';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import './styles/mobile-responsive.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

// Attach the session bearer to every backend call before the app can fetch.
installSessionFetch();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
