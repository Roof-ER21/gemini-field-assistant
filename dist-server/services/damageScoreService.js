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
        // Initialize factors
        const factors = {
            eventCount: allEvents.length,
            maxHailSize: this.getMaxHailSize(allEvents),
            recentActivity: this.getRecentEventCount(allEvents),
            cumulativeExposure: this.getCumulativeExposure(allEvents),
            severityDistribution: this.getSeverityDistribution(allEvents),
            recencyScore: this.calculateRecencyScore(allEvents),
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
     * Combine IHM and NOAA events into unified format
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
        // Add NOAA events (only hail events with magnitude)
        noaaEvents.forEach((event) => {
            if (event.eventType === 'hail' && event.magnitude !== null && event.magnitude > 0) {
                combined.push({
                    date: new Date(event.date),
                    hailSize: event.magnitude,
                });
            }
        });
        return combined;
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
     * - Event count: 0-20 points
     * - Max hail size: 0-30 points
     * - Recent activity: 0-25 points
     * - Cumulative exposure: 0-15 points
     * - Severity distribution: 0-10 points
     */
    calculateWeightedScore(factors) {
        let score = 0;
        // 1. Event count (0-20 points)
        // 1-2 events = low, 3-5 = moderate, 6-10 = high, 11+ = critical
        if (factors.eventCount === 0) {
            score += 0;
        }
        else if (factors.eventCount <= 2) {
            score += 5 + (factors.eventCount * 2.5); // 5-10 points
        }
        else if (factors.eventCount <= 5) {
            score += 10 + ((factors.eventCount - 2) * 2); // 10-16 points
        }
        else if (factors.eventCount <= 10) {
            score += 16 + ((factors.eventCount - 5) * 0.6); // 16-19 points
        }
        else {
            score += 20; // Max points
        }
        // 2. Max hail size (0-30 points)
        // 0.75" = 5pts, 1" = 10pts, 1.5" = 20pts, 2"+ = 30pts
        if (factors.maxHailSize >= 2.0) {
            score += 30;
        }
        else if (factors.maxHailSize >= 1.75) {
            score += 25;
        }
        else if (factors.maxHailSize >= 1.5) {
            score += 20;
        }
        else if (factors.maxHailSize >= 1.25) {
            score += 15;
        }
        else if (factors.maxHailSize >= 1.0) {
            score += 10;
        }
        else if (factors.maxHailSize >= 0.75) {
            score += 5;
        }
        // 3. Recent activity (0-25 points) - already calculated
        score += factors.recencyScore;
        // 4. Cumulative exposure (0-15 points)
        // Sum of all hail sizes indicates total exposure
        const cumulativeScore = Math.min(15, factors.cumulativeExposure * 1.5);
        score += cumulativeScore;
        // 5. Severity distribution (0-10 points)
        // Boost for severe events
        const severityScore = factors.severityDistribution.severe * 3 +
            factors.severityDistribution.moderate * 1.5 +
            factors.severityDistribution.minor * 0.5;
        score += Math.min(10, severityScore);
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
        const maxSize = factors.maxHailSize;
        const recentCount = factors.recentActivity;
        if (score === 0 || eventCount === 0) {
            return 'No significant hail history detected in this area. Low risk for storm damage.';
        }
        let summary = `${riskLevel} risk area with ${eventCount} recorded hail event${eventCount !== 1 ? 's' : ''}.`;
        if (maxSize >= 1.5) {
            summary += ` Maximum hail size of ${maxSize.toFixed(1)}" indicates significant damage potential.`;
        }
        else if (maxSize >= 1.0) {
            summary += ` Maximum hail size of ${maxSize.toFixed(1)}" suggests moderate damage risk.`;
        }
        if (recentCount > 0) {
            summary += ` ${recentCount} event${recentCount !== 1 ? 's' : ''} occurred in the past 12 months, indicating active storm activity.`;
        }
        if (factors.severityDistribution.severe > 0) {
            summary += ` ${factors.severityDistribution.severe} severe event${factors.severityDistribution.severe !== 1 ? 's' : ''} (1.5"+) recorded.`;
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
