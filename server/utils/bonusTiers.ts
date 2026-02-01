/**
 * Bonus Tier Calculation Utilities
 * Provides database-driven tier calculations with fallback to defaults
 */

import type { Pool } from 'pg';

export interface BonusTier {
  tier: number;
  name: string;
  minSignups: number;
  maxSignups: number;
  color: string;
  bonusDisplay: string;
}

export interface TierInfo {
  tier: number;
  name: string;
  color: string;
  bonusDisplay: string;
  nextTier: {
    name: string;
    signupsNeeded: number;
    bonusDisplay: string;
  } | null;
}

// Default tier structure (fallback if database is empty)
export const DEFAULT_TIERS: BonusTier[] = [
  { tier: 0, name: 'Rookie', minSignups: 0, maxSignups: 5, color: '#71717a', bonusDisplay: '' },
  { tier: 1, name: 'Bronze', minSignups: 6, maxSignups: 10, color: '#cd7f32', bonusDisplay: '' },
  { tier: 2, name: 'Silver', minSignups: 11, maxSignups: 14, color: '#c0c0c0', bonusDisplay: '' },
  { tier: 3, name: 'Gold', minSignups: 15, maxSignups: 19, color: '#ffd700', bonusDisplay: '$' },
  { tier: 4, name: 'Platinum', minSignups: 20, maxSignups: 24, color: '#e5e4e2', bonusDisplay: '$$' },
  { tier: 5, name: 'Diamond', minSignups: 25, maxSignups: 29, color: '#b9f2ff', bonusDisplay: '$$$' },
  { tier: 6, name: 'Elite', minSignups: 30, maxSignups: 999, color: '#9333ea', bonusDisplay: '$$$$$' }
];

// Cache for tier data (refreshed periodically)
let tierCache: BonusTier[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60000; // 1 minute

/**
 * Load tiers from database with caching
 */
export async function loadTiersFromDatabase(pool: Pool): Promise<BonusTier[]> {
  const now = Date.now();

  // Return cached tiers if still valid
  if (tierCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return tierCache;
  }

  try {
    const result = await pool.query(`
      SELECT tier_number, name, min_signups, max_signups, color, bonus_display
      FROM bonus_tiers
      WHERE is_active = true
      ORDER BY tier_number ASC
    `);

    if (result.rows.length === 0) {
      // Database is empty, use defaults
      tierCache = DEFAULT_TIERS;
      cacheTimestamp = now;
      return DEFAULT_TIERS;
    }

    // Transform database rows to BonusTier format
    tierCache = result.rows.map(row => ({
      tier: row.tier_number,
      name: row.name,
      minSignups: row.min_signups,
      maxSignups: row.max_signups,
      color: row.color,
      bonusDisplay: row.bonus_display || ''
    }));

    cacheTimestamp = now;
    return tierCache;
  } catch (error) {
    console.error('[BONUS_TIERS] Failed to load from database:', error);
    // Fallback to defaults on error
    return DEFAULT_TIERS;
  }
}

/**
 * Calculate bonus tier for a given number of signups
 */
export async function calculateBonusTier(signups: number, pool: Pool): Promise<TierInfo> {
  const tiers = await loadTiersFromDatabase(pool);

  let currentTier = tiers[0];
  for (const tier of tiers) {
    if (signups >= tier.minSignups) {
      currentTier = tier;
    }
  }

  const nextTierIndex = currentTier.tier + 1;
  const nextTier = nextTierIndex < tiers.length ? {
    name: tiers[nextTierIndex].name,
    signupsNeeded: tiers[nextTierIndex].minSignups - signups,
    bonusDisplay: tiers[nextTierIndex].bonusDisplay
  } : null;

  return {
    tier: currentTier.tier,
    name: currentTier.name,
    color: currentTier.color,
    bonusDisplay: currentTier.bonusDisplay,
    nextTier
  };
}

/**
 * Calculate tier number only (for database updates)
 */
export async function calculateBonusTierNumber(signups: number, pool: Pool): Promise<number> {
  const tiers = await loadTiersFromDatabase(pool);

  let currentTierNumber = 0;
  for (const tier of tiers) {
    if (signups >= tier.minSignups) {
      currentTierNumber = tier.tier;
    }
  }

  return currentTierNumber;
}

/**
 * Synchronous tier calculation using cached data (for sheetsService compatibility)
 */
export function calculateBonusTierSync(signups: number): number {
  const tiers = tierCache || DEFAULT_TIERS;

  let currentTierNumber = 0;
  for (const tier of tiers) {
    if (signups >= tier.minSignups) {
      currentTierNumber = tier.tier;
    }
  }

  return currentTierNumber;
}

/**
 * Clear the tier cache (call after admin updates tiers)
 */
export function clearTierCache(): void {
  tierCache = null;
  cacheTimestamp = 0;
}

/**
 * Get all tiers (for admin UI)
 */
export async function getAllTiers(pool: Pool): Promise<BonusTier[]> {
  return loadTiersFromDatabase(pool);
}

/**
 * Get default tiers (for reset functionality)
 */
export function getDefaultTiers(): BonusTier[] {
  return [...DEFAULT_TIERS];
}

// Alias for backward compatibility
export const BONUS_TIERS = DEFAULT_TIERS;
