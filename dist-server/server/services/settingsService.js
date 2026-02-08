/**
 * Settings Service
 * Manages system-wide configuration stored in system_settings table
 */
// Default feature flags (fallback if DB is unavailable)
const DEFAULT_FEATURES = {
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
    pool;
    cache = new Map();
    CACHE_TTL = 60000; // 1 minute cache
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Get a single setting by key
     */
    async getSetting(key) {
        // Check cache first
        const cached = this.cache.get(key);
        if (cached && cached.expiry > Date.now()) {
            return cached.value;
        }
        try {
            const result = await this.pool.query(`SELECT key, value, category, description, updated_at, updated_by
         FROM system_settings WHERE key = $1`, [key]);
            if (result.rows.length === 0) {
                return null;
            }
            const setting = result.rows[0];
            this.cache.set(key, { value: setting, expiry: Date.now() + this.CACHE_TTL });
            return setting;
        }
        catch (error) {
            console.error('[SettingsService] Error getting setting:', error);
            return null;
        }
    }
    /**
     * Get all settings in a category
     */
    async getSettingsByCategory(category) {
        try {
            const result = await this.pool.query(`SELECT key, value, category, description, updated_at, updated_by
         FROM system_settings WHERE category = $1 ORDER BY key`, [category]);
            return result.rows;
        }
        catch (error) {
            console.error('[SettingsService] Error getting settings by category:', error);
            return [];
        }
    }
    /**
     * Get all settings
     */
    async getAllSettings() {
        try {
            const result = await this.pool.query(`SELECT key, value, category, description, updated_at, updated_by
         FROM system_settings ORDER BY category, key`);
            return result.rows;
        }
        catch (error) {
            console.error('[SettingsService] Error getting all settings:', error);
            return [];
        }
    }
    /**
     * Update a setting value
     */
    async updateSetting(key, value, updatedBy) {
        try {
            const result = await this.pool.query(`UPDATE system_settings
         SET value = $1, updated_by = $2, updated_at = NOW()
         WHERE key = $3
         RETURNING key, value, category, description, updated_at, updated_by`, [JSON.stringify(value), updatedBy || null, key]);
            if (result.rows.length === 0) {
                return null;
            }
            // Invalidate cache
            this.cache.delete(key);
            return result.rows[0];
        }
        catch (error) {
            console.error('[SettingsService] Error updating setting:', error);
            throw error;
        }
    }
    /**
     * Get all feature flags as a simple object
     */
    async getFeatureFlags() {
        try {
            const result = await this.pool.query(`SELECT key, value FROM system_settings WHERE category = 'features'`);
            const flags = { ...DEFAULT_FEATURES };
            for (const row of result.rows) {
                const key = row.key;
                if (key in flags) {
                    flags[key] = row.value?.enabled ?? true;
                }
            }
            return flags;
        }
        catch (error) {
            console.error('[SettingsService] Error getting feature flags:', error);
            return DEFAULT_FEATURES;
        }
    }
    /**
     * Toggle a feature flag
     */
    async toggleFeature(featureKey, enabled, updatedBy) {
        try {
            await this.updateSetting(featureKey, { enabled }, updatedBy);
            return true;
        }
        catch (error) {
            console.error('[SettingsService] Error toggling feature:', error);
            return false;
        }
    }
    /**
     * Get setting change history
     */
    async getSettingHistory(key, limit = 50) {
        try {
            let query = `
        SELECT l.id, l.setting_key, l.old_value, l.new_value,
               l.changed_by, l.changed_at, l.reason,
               u.name as changed_by_name, u.email as changed_by_email
        FROM system_settings_log l
        LEFT JOIN users u ON l.changed_by = u.id
      `;
            const params = [];
            if (key) {
                query += ' WHERE l.setting_key = $1';
                params.push(key);
            }
            query += ' ORDER BY l.changed_at DESC LIMIT $' + (params.length + 1);
            params.push(limit);
            const result = await this.pool.query(query, params);
            return result.rows;
        }
        catch (error) {
            console.error('[SettingsService] Error getting setting history:', error);
            return [];
        }
    }
    /**
     * Get leaderboard settings
     */
    async getLeaderboardSettings() {
        try {
            const [syncSetting, tiersSetting] = await Promise.all([
                this.getSetting('leaderboard_sync_enabled'),
                this.getSetting('leaderboard_tiers')
            ]);
            return {
                syncEnabled: syncSetting?.value?.enabled ?? true,
                syncIntervalHours: syncSetting?.value?.interval_hours ?? 12,
                tiers: tiersSetting?.value ?? {
                    rookie_to_bronze: 5,
                    bronze_to_silver: 15,
                    silver_to_gold: 30,
                    gold_to_platinum: 50
                }
            };
        }
        catch (error) {
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
    async getSusanSettings() {
        try {
            const settings = await this.getSettingsByCategory('susan');
            const settingsMap = new Map(settings.map(s => [s.key, s.value]));
            return {
                model: settingsMap.get('susan_model') ?? {
                    provider: 'gemini',
                    model: 'gemini-2.0-flash'
                },
                voiceEnabled: settingsMap.get('susan_voice_enabled')?.enabled ?? true,
                roleplayEnabled: settingsMap.get('susan_roleplay_enabled')?.enabled ?? true,
                stormLookupEnabled: settingsMap.get('susan_storm_lookup')?.enabled ?? true,
                performanceCoachingEnabled: settingsMap.get('susan_performance_coaching')?.enabled ?? true
            };
        }
        catch (error) {
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
    clearCache() {
        this.cache.clear();
    }
}
// Singleton instance (will be initialized when pool is available)
let settingsServiceInstance = null;
export function initSettingsService(pool) {
    settingsServiceInstance = new SettingsService(pool);
    return settingsServiceInstance;
}
export function getSettingsService() {
    return settingsServiceInstance;
}
