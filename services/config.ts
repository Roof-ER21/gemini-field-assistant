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

  return hasCapacitorNative || isNativePlatform || isSpecialProtocol || isCapacitorLocalhost;
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
let _cachedApiUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (_cachedApiUrl) return _cachedApiUrl;

  if (isCapacitorNative()) {
    _cachedApiUrl = PRODUCTION_API_URL;
  } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    _cachedApiUrl = '/api';
  } else {
    _cachedApiUrl = `${window.location.origin}/api`;
  }

  console.log('[Config] API URL:', _cachedApiUrl);
  return _cachedApiUrl;
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
