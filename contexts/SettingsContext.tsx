import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

/**
 * Feature flags that control visibility of app features in the sidebar
 */
export interface FeatureFlags {
  feature_leaderboard: boolean;
  feature_territories: boolean;
  feature_canvassing: boolean;
  feature_impacted_assets: boolean;
  feature_storm_map: boolean;
  feature_agnes: boolean;
  feature_live: boolean;
  feature_susan_chat: boolean;
}

interface SettingsContextType {
  features: FeatureFlags;
  loading: boolean;
  error: string | null;
  refreshFeatures: () => Promise<void>;
  isFeatureEnabled: (featureKey: keyof FeatureFlags) => boolean;
}

// Default all features enabled
const DEFAULT_FEATURES: FeatureFlags = {
  feature_leaderboard: true,
  feature_territories: true,
  feature_canvassing: true,
  feature_impacted_assets: true,
  feature_storm_map: true,
  feature_agnes: true,
  feature_live: true,
  feature_susan_chat: true
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * SettingsProvider - Provides feature flags to the entire app
 *
 * Features are fetched from /api/settings/features on mount
 * and cached in localStorage for faster subsequent loads.
 *
 * The sidebar uses this context to hide/show features based on admin settings.
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const [features, setFeatures] = useState<FeatureFlags>(() => {
    // Try to load from localStorage first for faster initial render
    try {
      const cached = localStorage.getItem('feature_flags');
      if (cached) {
        return { ...DEFAULT_FEATURES, ...JSON.parse(cached) };
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return DEFAULT_FEATURES;
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/features');
      if (!response.ok) {
        throw new Error('Failed to fetch features');
      }
      const data = await response.json();

      // Merge with defaults to ensure all keys exist
      const mergedFeatures = { ...DEFAULT_FEATURES, ...data };
      setFeatures(mergedFeatures);
      setError(null);

      // Cache in localStorage
      try {
        localStorage.setItem('feature_flags', JSON.stringify(mergedFeatures));
      } catch (e) {
        // Ignore localStorage errors
      }
    } catch (err) {
      console.error('[SettingsContext] Error fetching features:', err);
      setError((err as Error).message);
      // Keep using cached/default features on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch features on mount
  useEffect(() => {
    fetchFeatures();

    // Also refresh features every 5 minutes
    const interval = setInterval(fetchFeatures, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFeatures]);

  // Listen for visibility changes to refresh when user returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchFeatures();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchFeatures]);

  const isFeatureEnabled = useCallback(
    (featureKey: keyof FeatureFlags) => {
      return features[featureKey] ?? true;
    },
    [features]
  );

  const value: SettingsContextType = {
    features,
    loading,
    error,
    refreshFeatures: fetchFeatures,
    isFeatureEnabled
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access feature flags and settings
 */
export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

/**
 * Hook to check if a specific feature is enabled
 * Returns true by default if context is unavailable (graceful degradation)
 */
export function useFeatureEnabled(featureKey: keyof FeatureFlags): boolean {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    // Return true if used outside provider (shouldn't happen, but graceful fallback)
    return true;
  }
  return context.isFeatureEnabled(featureKey);
}

export default SettingsContext;
