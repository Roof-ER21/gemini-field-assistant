/**
 * Centralized Configuration Service
 * Handles environment-aware API URL detection
 */

/**
 * Get the API base URL based on the current environment
 *
 * Priority:
 * 1. Runtime detection (window.location) - ALWAYS FIRST
 * 2. VITE_API_URL environment variable (only as fallback)
 *
 * Logic:
 * - localhost/127.0.0.1 → http://localhost:3001/api
 * - production (any other domain) → same origin + /api
 *
 * @returns The API base URL (without trailing slash)
 */
export function getApiBaseUrl(): string {
  // ALWAYS do runtime detection first
  const isLocalhost = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';

  if (isLocalhost) {
    const url = 'http://localhost:3001/api';
    console.log('[Config] 🔧 Development mode detected');
    console.log('[Config] API URL:', url);
    return url;
  }

  // Production: use same origin (works for Railway, Vercel, etc.)
  const url = `${window.location.origin}/api`;
  console.log('[Config] 🚀 Production mode detected');
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
