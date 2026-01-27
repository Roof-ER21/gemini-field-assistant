/**
 * Centralized Configuration Service
 * Handles environment-aware API URL detection
 */

// Production API URL for native apps (Susan 21 = sa21)
const PRODUCTION_API_URL = 'https://sa21.up.railway.app/api';

/**
 * Detect if running in a Capacitor native app
 */
function isCapacitorNative(): boolean {
  // Multiple detection methods for Capacitor native environment
  const Capacitor = (window as any).Capacitor;

  // Method 1: Check Capacitor.isNativePlatform() function
  const hasCapacitorNative = Capacitor?.isNativePlatform?.() === true;

  // Method 2: Check Capacitor.getPlatform() returns 'ios' or 'android'
  const platform = Capacitor?.getPlatform?.();
  const isNativePlatform = platform === 'ios' || platform === 'android';

  // Method 3: Check protocol schemes
  const protocol = window.location.protocol;
  const isSpecialProtocol = protocol === 'ionic:' ||
                            protocol === 'capacitor:' ||
                            protocol === 'file:';

  // Method 4: Capacitor uses localhost with custom scheme on iOS
  const isCapacitorLocalhost = Capacitor &&
                               window.location.hostname === 'localhost' &&
                               protocol !== 'http:' &&
                               protocol !== 'https:';

  const result = hasCapacitorNative || isNativePlatform || isSpecialProtocol || isCapacitorLocalhost;

  console.log('[Config] Capacitor detection:', {
    hasCapacitorNative,
    isNativePlatform,
    platform,
    protocol,
    isSpecialProtocol,
    isCapacitorLocalhost,
    result
  });

  return result;
}

/**
 * Get the API base URL based on the current environment
 *
 * Priority:
 * 1. Capacitor native app → Production API
 * 2. localhost/127.0.0.1 → Local dev server
 * 3. Production web → Same origin
 *
 * @returns The API base URL (without trailing slash)
 */
export function getApiBaseUrl(): string {
  // Check for Capacitor native app FIRST
  if (isCapacitorNative()) {
    console.log('[Config] 📱 Capacitor native app detected');
    console.log('[Config] API URL:', PRODUCTION_API_URL);
    return PRODUCTION_API_URL;
  }

  // Check for localhost development
  const isLocalhost = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';

  if (isLocalhost) {
    const url = 'http://localhost:3001/api';
    console.log('[Config] 🔧 Development mode detected');
    console.log('[Config] API URL:', url);
    return url;
  }

  // Production web: use same origin (works for Railway, Vercel, etc.)
  const url = `${window.location.origin}/api`;
  console.log('[Config] 🚀 Production web detected');
  console.log('[Config] Origin:', window.location.origin);
  console.log('[Config] Hostname:', window.location.hostname);
  console.log('[Config] Protocol:', window.location.protocol);
  console.log('[Config] API URL:', url);

  return url;
}

/**
 * Configuration singleton
 */
class Config {
  private static instance: Config;
  private apiBaseUrl: string;

  private constructor() {
    this.apiBaseUrl = getApiBaseUrl();
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  getApiUrl(): string {
    return this.apiBaseUrl;
  }

  /**
   * Check if we're running in production
   */
  isProduction(): boolean {
    return window.location.hostname !== 'localhost' &&
           window.location.hostname !== '127.0.0.1';
  }

  /**
   * Check if we're running in development
   */
  isDevelopment(): boolean {
    return !this.isProduction();
  }

  /**
   * Get environment name
   */
  getEnvironment(): 'development' | 'production' {
    return this.isProduction() ? 'production' : 'development';
  }
}

// Export singleton instance
export const config = Config.getInstance();

// Export for convenience
export const API_BASE_URL = config.getApiUrl();
