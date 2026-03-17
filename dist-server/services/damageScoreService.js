/**
 * Damage Score Service
 * Calculates a 0-100 damage risk score based on historical hail events
 *
 * Algorithm factors:
 * - Hail event count (more = higher risk)
 * - Max hail size ever recorded (>1.5" = significant boost)
 * - Recent activity (events in last 12 months weighted 2x)
 * - Cumulative hail exposure (sum of all hail sizes)
 * - Event severity distribution
 *
 * Score Ranges:
 * 0-25: Low Risk (minimal storm history)
 * 26-50: Moderate Risk (some exposure)
 * 51-75: High Risk (significant history)
 * 76-100: Critical (multiple severe events)
 */
export class DamageScoreService {
    /**
     * Calculate damage score for a location based on hail events
     */
    calculateDamageScore(input) {
        const { events = [], noaaEvents = [] } = input;
        // Combine all events into a unified format
        const allEvents = this.combineEvents(events, noaaEvents);
        // Temporal clustering: deduplicate by storm system (episodeId or same calendar day)
        const stormSystems = this.clusterByStormSystem(allEvents);
        // Parse total documented property damage from NOAA
        const documentedDamage = this.sumDocumentedDamage(noaaEvents);
        // Count wind events
        const windEvents = noaaEvents.filter(e => e.eventType === 'wind').length;
        // Initialize factors
        const factors = {
            eventCount: allEvents.length,
            stormSystemCount: stormSystems.length,
            maxHailSize: this.getMaxHailSize(allEvents),
            recentActivity: this.getRecentEventCount(allEvents),
            cumulativeExposure: this.getCumulativeExposure(allEvents),
            severityDistribution: this.getSeverityDistribution(allEvents),
            recencyScore: this.calculateRecencyScore(allEvents),
            documentedDamage,
            windEvents,
        };
        // Calculate weighted score (0-100)
        const score = this.calculateWeightedScore(factors);
        // Determine risk level
        const riskLevel = this.getRiskLevel(score);
        // Generate summary
        const summary = this.generateSummary(score, factors);
        // Get color based on score
        const color = this.getScoreColor(score);
        return {
            score: Math.round(score),
            riskLevel,
            factors,
            summary,
            color,
        };
    }
    /**
     * Combine IHM and NOAA events into unified format.
     * Includes wind events (mapped to equivalent hail damage potential).
     */
    combineEvents(events, noaaEvents) {
        const combined = [];
        // Add IHM events
        events.forEach((event) => {
            if (event.hailSize !== null && event.hailSize > 0) {
                combined.push({
                    date: new Date(event.date),
                    hailSize: event.hailSize,
                });
            }
        });
        // Add NOAA hail events
        noaaEvents.forEach((event) => {
            if (event.eventType === 'hail' && event.magnitude !== null && event.magnitude > 0) {
                combined.push({
                    date: new Date(event.date),
                    hailSize: event.magnitude,
                    episodeId: event.episodeId,
                });
            }
            // Wind events: 58+ kt (severe criteria) maps to ~1" equivalent damage potential
            if (event.eventType === 'wind' && event.magnitude !== null && event.magnitude >= 50) {
                const windEquiv = event.magnitude >= 75 ? 1.5 : event.magnitude >= 58 ? 1.0 : 0.5;
                combined.push({
                    date: new Date(event.date),
                    hailSize: windEquiv,
                    episodeId: event.episodeId,
                });
            }
        });
        return combined;
    }
    /**
     * Cluster events by storm system: group by episodeId or same calendar day.
     * Returns one entry per storm system with the max hail size from that system.
     */
    clusterByStormSystem(events) {
        const systems = new Map();
        events.forEach(e => {
            // Use episodeId if available, otherwise use calendar date as cluster key
            const key = e.episodeId || e.date.toISOString().split('T')[0];
            const existing = systems.get(key);
            if (existing) {
                existing.maxHailSize = Math.max(existing.maxHailSize, e.hailSize);
                existing.eventCount++;
            }
            else {
                systems.set(key, { date: e.date, maxHailSize: e.hailSize, eventCount: 1 });
            }
        });
        return Array.from(systems.values());
    }
    /**
     * Sum documented property damage from NOAA events.
     * Parses "$25,000" format strings back to numbers.
     */
    sumDocumentedDamage(noaaEvents) {
        let total = 0;
        noaaEvents.forEach(e => {
            if (e.damageProperty) {
                const num = parseFloat(e.damageProperty.replace(/[$,]/g, ''));
                if (!isNaN(num))
                    total += num;
            }
        });
        return total;
    }
    /**
     * Get maximum hail size from all events
     */
    getMaxHailSize(events) {
        if (events.length === 0)
            return 0;
        return Math.max(...events.map((e) => e.hailSize));
    }
    /**
     * Count events in the last 12 months
     */
    getRecentEventCount(events) {
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        return events.filter((e) => e.date >= twelveMonthsAgo).length;
    }
    /**
     * Calculate cumulative hail exposure (sum of all hail sizes)
     */
    getCumulativeExposure(events) {
        return events.reduce((sum, e) => sum + e.hailSize, 0);
    }
    /**
     * Get severity distribution
     */
    getSeverityDistribution(events) {
        const distribution = { severe: 0, moderate: 0, minor: 0 };
        events.forEach((e) => {
            if (e.hailSize >= 1.5) {
                distribution.severe++;
            }
            else if (e.hailSize >= 1.0) {
                distribution.moderate++;
            }
            else {
                distribution.minor++;
            }
        });
        return distribution;
    }
    /**
     * Calculate recency score (0-25 points)
     * Higher if recent events, decays over time
     */
    calculateRecencyScore(events) {
        if (events.length === 0)
            return 0;
        const now = new Date();
        let recencyScore = 0;
        events.forEach((e) => {
            const monthsAgo = (now.getTime() - e.date.getTime()) / (1000 * 60 * 60 * 24 * 30);
            // Decay factor: events in last 6 months get full weight, then decay
            let weight = 1;
            if (monthsAgo <= 6) {
                weight = 1.5; // Boost recent events
            }
            else if (monthsAgo <= 12) {
                weight = 1.2;
            }
            else if (monthsAgo <= 24) {
                weight = 0.8;
            }
            else {
                weight = 0.5;
            }
            // Size multiplier
            const sizeMultiplier = e.hailSize >= 1.5 ? 2 : e.hailSize >= 1.0 ? 1.5 : 1;
            recencyScore += weight * sizeMultiplier;
        });
        // Normalize to 0-25 range
        return Math.min(25, recencyScore);
    }
    /**
     * Calculate weighted score (0-100)
     *
     * Scoring breakdown:
     * - Storm system count: 0-20 points (deduplicated, not raw event count)
     * - Max hail size: 0-25 points
     * - Recent activity: 0-20 points
     * - Cumulative exposure: 0-10 points
     * - Severity distribution: 0-8 points
     * - Documented damage: 0-10 points (NOAA property damage records)
     * - Wind events: 0-7 points (damaging wind compounds hail damage)
     */
    calculateWeightedScore(factors) {
        let score = 0;
        // 1. Storm system count (0-20 points) — uses deduplicated storm count, not raw events
        // This prevents a single storm with 10 observation reports from inflating the score
        const storms = factors.stormSystemCount;
        if (storms === 0) {
            score += 0;
        }
        else if (storms <= 2) {
            score += 5 + (storms * 2.5); // 7.5-10
        }
        else if (storms <= 5) {
            score += 10 + ((storms - 2) * 2); // 12-16
        }
        else if (storms <= 10) {
            score += 16 + ((storms - 5) * 0.8); // 16-20
        }
        else {
            score += 20;
        }
        // 2. Max hail size (0-25 points)
        if (factors.maxHailSize >= 2.0) {
            score += 25;
        }
        else if (factors.maxHailSize >= 1.75) {
            score += 22;
        }
        else if (factors.maxHailSize >= 1.5) {
            score += 18;
        }
        else if (factors.maxHailSize >= 1.25) {
            score += 13;
        }
        else if (factors.maxHailSize >= 1.0) {
            score += 9;
        }
        else if (factors.maxHailSize >= 0.75) {
            score += 5;
        }
        // 3. Recent activity (0-20 points) — scaled from recencyScore (0-25 internal)
        score += Math.min(20, factors.recencyScore * 0.8);
        // 4. Cumulative exposure (0-10 points)
        const cumulativeScore = Math.min(10, factors.cumulativeExposure * 1.0);
        score += cumulativeScore;
        // 5. Severity distribution (0-8 points)
        const severityScore = factors.severityDistribution.severe * 2.5 +
            factors.severityDistribution.moderate * 1.2 +
            factors.severityDistribution.minor * 0.4;
        score += Math.min(8, severityScore);
        // 6. Documented property damage (0-10 points) — NOAA verified loss records
        // Any documented damage is strong evidence; >$10k is very significant
        if (factors.documentedDamage > 0) {
            if (factors.documentedDamage >= 100_000) {
                score += 10;
            }
            else if (factors.documentedDamage >= 25_000) {
                score += 8;
            }
            else if (factors.documentedDamage >= 10_000) {
                score += 6;
            }
            else if (factors.documentedDamage >= 1_000) {
                score += 4;
            }
            else {
                score += 2;
            }
        }
        // 7. Wind events (0-7 points) — damaging wind compounds hail damage
        // Wind can cause tree/debris damage to roofs even without hail
        if (factors.windEvents > 0) {
            score += Math.min(7, factors.windEvents * 2);
        }
        return Math.min(100, Math.max(0, score));
    }
    /**
     * Get risk level based on score
     */
    getRiskLevel(score) {
        if (score >= 76)
            return 'Critical';
        if (score >= 51)
            return 'High';
        if (score >= 26)
            return 'Moderate';
        return 'Low';
    }
    /**
     * Generate human-readable summary
     */
    generateSummary(score, factors) {
        const riskLevel = this.getRiskLevel(score);
        const eventCount = factors.eventCount;
        const stormCount = factors.stormSystemCount;
        const maxSize = factors.maxHailSize;
        const recentCount = factors.recentActivity;
        if (score === 0 || eventCount === 0) {
            return 'No significant storm history detected in this area. Low risk for storm damage.';
        }
        let summary = `${riskLevel} risk area with ${stormCount} documented storm system${stormCount !== 1 ? 's' : ''} (${eventCount} total observations).`;
        if (maxSize >= 1.5) {
            summary += ` Maximum hail size of ${maxSize.toFixed(1)}" indicates significant damage potential.`;
        }
        else if (maxSize >= 1.0) {
            summary += ` Maximum hail size of ${maxSize.toFixed(1)}" suggests moderate damage risk.`;
        }
        if (recentCount > 0) {
            summary += ` ${recentCount} event${recentCount !== 1 ? 's' : ''} in the past 12 months.`;
        }
        if (factors.documentedDamage > 0) {
            summary += ` NOAA records document $${factors.documentedDamage.toLocaleString()} in property damage.`;
        }
        if (factors.windEvents > 0) {
            summary += ` ${factors.windEvents} damaging wind event${factors.windEvents !== 1 ? 's' : ''} also recorded.`;
        }
        if (factors.severityDistribution.severe > 0) {
            summary += ` ${factors.severityDistribution.severe} severe event${factors.severityDistribution.severe !== 1 ? 's' : ''} (1.5"+).`;
        }
        return summary;
    }
    /**
     * Get color based on score
     */
    getScoreColor(score) {
        if (score >= 76)
            return '#dc2626'; // Red (Critical)
        if (score >= 51)
            return '#f97316'; // Orange (High)
        if (score >= 26)
            return '#eab308'; // Yellow (Moderate)
        return '#22c55e'; // Green (Low)
    }
}
export const damageScoreService = new DamageScoreService();
