/**
 * Settings Service
 * Manages system-wide configuration stored in system_settings table
 */

import type { Pool } from 'pg';

export interface SystemSetting {
  key: string;
  value: Record<string, unknown>;
  category: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

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

export interface SettingChangeLog {
  id: number;
  setting_key: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown>;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

// Default feature flags (fallback if DB is unavailable)
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

export class SettingsService {
  private pool: Pool;
  private cache: Map<string, { value: SystemSetting; expiry: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get a single setting by key
   */
  async getSetting(key: string): Promise<SystemSetting | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    try {
      const result = await this.pool.query(
        `SELECT key, value, category, description, updated_at, updated_by
         FROM system_settings WHERE key = $1`,
        [key]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const setting = result.rows[0] as SystemSetting;
      this.cache.set(key, { value: setting, expiry: Date.now() + this.CACHE_TTL });
      return setting;
    } catch (error) {
      console.error('[SettingsService] Error getting setting:', error);
      return null;
    }
  }

  /**
   * Get all settings in a category
   */
  async getSettingsByCategory(category: string): Promise<SystemSetting[]> {
    try {
      const result = await this.pool.query(
        `SELECT key, value, category, description, updated_at, updated_by
         FROM system_settings WHERE category = $1 ORDER BY key`,
        [category]
      );
      return result.rows as SystemSetting[];
    } catch (error) {
      console.error('[SettingsService] Error getting settings by category:', error);
      return [];
    }
  }

  /**
   * Get all settings
   */
  async getAllSettings(): Promise<SystemSetting[]> {
    try {
      const result = await this.pool.query(
        `SELECT key, value, category, description, updated_at, updated_by
         FROM system_settings ORDER BY category, key`
      );
      return result.rows as SystemSetting[];
    } catch (error) {
      console.error('[SettingsService] Error getting all settings:', error);
      return [];
    }
  }

  /**
   * Update a setting value
   */
  async updateSetting(
    key: string,
    value: Record<string, unknown>,
    updatedBy?: string
  ): Promise<SystemSetting | null> {
    try {
      const result = await this.pool.query(
        `UPDATE system_settings
         SET value = $1, updated_by = $2, updated_at = NOW()
         WHERE key = $3
         RETURNING key, value, category, description, updated_at, updated_by`,
        [JSON.stringify(value), updatedBy || null, key]
      );

      if (result.rows.length === 0) {
        return null;
      }

      // Invalidate cache
      this.cache.delete(key);

      return result.rows[0] as SystemSetting;
    } catch (error) {
      console.error('[SettingsService] Error updating setting:', error);
      throw error;
    }
  }

  /**
   * Get all feature flags as a simple object
   */
  async getFeatureFlags(): Promise<FeatureFlags> {
    try {
      const result = await this.pool.query(
        `SELECT key, value FROM system_settings WHERE category = 'features'`
      );

      const flags: FeatureFlags = { ...DEFAULT_FEATURES };

      for (const row of result.rows) {
        const key = row.key as keyof FeatureFlags;
        if (key in flags) {
          flags[key] = row.value?.enabled ?? true;
        }
      }

      return flags;
    } catch (error) {
      console.error('[SettingsService] Error getting feature flags:', error);
      return DEFAULT_FEATURES;
    }
  }

  /**
   * Toggle a feature flag
   */
  async toggleFeature(
    featureKey: string,
    enabled: boolean,
    updatedBy?: string
  ): Promise<boolean> {
    try {
      await this.updateSetting(featureKey, { enabled }, updatedBy);
      return true;
    } catch (error) {
      console.error('[SettingsService] Error toggling feature:', error);
      return false;
    }
  }

  /**
   * Get setting change history
   */
  async getSettingHistory(
    key?: string,
    limit = 50
  ): Promise<SettingChangeLog[]> {
    try {
      let query = `
        SELECT l.id, l.setting_key, l.old_value, l.new_value,
               l.changed_by, l.changed_at, l.reason,
               u.name as changed_by_name, u.email as changed_by_email
        FROM system_settings_log l
        LEFT JOIN users u ON l.changed_by = u.id
      `;
      const params: (string | number)[] = [];

      if (key) {
        query += ' WHERE l.setting_key = $1';
        params.push(key);
      }

      query += ' ORDER BY l.changed_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await this.pool.query(query, params);
      return result.rows as SettingChangeLog[];
    } catch (error) {
      console.error('[SettingsService] Error getting setting history:', error);
      return [];
    }
  }

  /**
   * Get leaderboard settings
   */
  async getLeaderboardSettings(): Promise<{
    syncEnabled: boolean;
    syncIntervalHours: number;
    tiers: Record<string, number>;
  }> {
    try {
      const [syncSetting, tiersSetting] = await Promise.all([
        this.getSetting('leaderboard_sync_enabled'),
        this.getSetting('leaderboard_tiers')
      ]);

      return {
        syncEnabled: (syncSetting?.value?.enabled as boolean) ?? true,
        syncIntervalHours: (syncSetting?.value?.interval_hours as number) ?? 12,
        tiers: (tiersSetting?.value as Record<string, number>) ?? {
          rookie_to_bronze: 5,
          bronze_to_silver: 15,
          silver_to_gold: 30,
          gold_to_platinum: 50
        }
      };
    } catch (error) {
      console.error('[SettingsService] Error getting leaderboard settings:', error);
      return {
        syncEnabled: true,
        syncIntervalHours: 12,
        tiers: {
          rookie_to_bronze: 5,
          bronze_to_silver: 15,
          silver_to_gold: 30,
          gold_to_platinum: 50
        }
      };
    }
  }

  /**
   * Get Susan AI settings
   */
  async getSusanSettings(): Promise<{
    model: { provider: string; model: string };
    voiceEnabled: boolean;
    roleplayEnabled: boolean;
    stormLookupEnabled: boolean;
    performanceCoachingEnabled: boolean;
  }> {
    try {
      const settings = await this.getSettingsByCategory('susan');
      const settingsMap = new Map(settings.map(s => [s.key, s.value]));

      return {
        model: (settingsMap.get('susan_model') as { provider: string; model: string }) ?? {
          provider: 'gemini',
          model: 'gemini-2.0-flash'
        },
        voiceEnabled: (settingsMap.get('susan_voice_enabled') as { enabled: boolean })?.enabled ?? true,
        roleplayEnabled: (settingsMap.get('susan_roleplay_enabled') as { enabled: boolean })?.enabled ?? true,
        stormLookupEnabled: (settingsMap.get('susan_storm_lookup') as { enabled: boolean })?.enabled ?? true,
        performanceCoachingEnabled: (settingsMap.get('susan_performance_coaching') as { enabled: boolean })?.enabled ?? true
      };
    } catch (error) {
      console.error('[SettingsService] Error getting Susan settings:', error);
      return {
        model: { provider: 'gemini', model: 'gemini-2.0-flash' },
        voiceEnabled: true,
        roleplayEnabled: true,
        stormLookupEnabled: true,
        performanceCoachingEnabled: true
      };
    }
  }

  /**
   * Clear cache (useful after bulk updates)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance (will be initialized when pool is available)
let settingsServiceInstance: SettingsService | null = null;

export function initSettingsService(pool: Pool): SettingsService {
  settingsServiceInstance = new SettingsService(pool);
  return settingsServiceInstance;
}

export function getSettingsService(): SettingsService | null {
  return settingsServiceInstance;
}
