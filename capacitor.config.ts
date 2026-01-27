import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.roofer.susanai',
  appName: 'Susan AI-21',
  webDir: 'dist',
  // Server config for API access
  server: {
    // Allow API calls to production backend
    allowNavigation: ['a21.up.railway.app', '*.railway.app'],
    // Clear text traffic for development (iOS will use HTTPS anyway)
    cleartext: false
  },
  ios: {
    // iOS-specific configurations
    contentInset: 'automatic',
    allowsLinkPreview: true,
    scrollEnabled: true,
    // Recommended for App Store
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
    // Scheme for deep linking
    scheme: 'susanai'
  },
  plugins: {
    // Keyboard plugin settings
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    }
  }
};

export default config;
