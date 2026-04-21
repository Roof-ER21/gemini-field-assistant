/**
 * repReportService — rep / customer self-report of hail/wind events
 *
 * This is the proprietary moat. Neither HailTrace nor IHM have field-rep crowdsourcing.
 *
 * Flow:
 *   1. Rep taps "Report Hail" in Hail Yes → GPS auto-captured → size dropdown + photo
 *   2. POST /api/hail/rep-report → this service upserts to verified_hail_events
 *      with source_rep_report=true, rep_report_verified_by_admin=false (default)
 *   3. Admin dashboard shows pending reports → approve/reject
 *   4. Approved reports flip rep_report_verified_by_admin=true → increment public count
 *
 * Customer reports use same flow with source=customer_report.
 *
 * Trust tiers (future):
 *   - Trusted reps (N verified reports) can get auto-approved after 5+ verified submissions
 *   - For now: all rep/customer reports require admin review
 */

import { Pool } from 'pg';
import { VerifiedEventsService, SourceName } from './verifiedEventsService.js';

export interface RepReportInput {
  latitude: number;
  longitude: number;
  eventDate: string;                   // ISO or YYYY-MM-DD
  hailSizeInches?: number;
  windMph?: number;
  tornadoEfRank?: number;
  photoUrls?: string[];
  notes?: string;
  state?: string;
  submittedByUserId?: string;          // rep user ID
  isCustomerReport?: boolean;          // true for public form submissions
}

export interface RepReportResult {
  id: string;
  wasInserted: boolean;
  verificationCount: number;
  confidenceTier: string;
  status: 'pending_review' | 'auto_approved' | 'merged_with_existing';
}

export class RepReportService {
  private svc: VerifiedEventsService;

  constructor(private pool: Pool) {
    this.svc = new VerifiedEventsService(pool);
  }

  async submit(input: RepReportInput): Promise<RepReportResult> {
    // Rate limit check: max 20 reports per user per day
    if (input.submittedByUserId) {
      const rateLimitCheck = await this.pool.query(
        `SELECT COUNT(*)::int AS c FROM verified_hail_events
         WHERE rep_report_submitted_by_user_id = $1
           AND rep_report_submitted_at >= NOW() - INTERVAL '24 hours'`,
        [input.submittedByUserId]
      );
      if ((rateLimitCheck.rows[0]?.c || 0) >= 20) {
        throw new Error('Daily rep report limit (20) reached. Contact admin.');
      }
    }

    // Validate at least one measurement
    if (
      (input.hailSizeInches == null || input.hailSizeInches <= 0) &&
      (input.windMph == null || input.windMph <= 0) &&
      (input.tornadoEfRank == null)
    ) {
      throw new Error('At least one of hail_size_inches, wind_mph, tornado_ef_rank required.');
    }

    // Validate lat/lng in-bounds (US)
    if (input.latitude < 18 || input.latitude > 72 || input.longitude < -180 || input.longitude > -66) {
      throw new Error('Location outside US bounds.');
    }

    const source: SourceName = input.isCustomerReport ? 'customer_report' : 'rep_report';

    // Check trusted-rep eligibility (future enhancement)
    const preApproved = await this.checkAutoApprove(input.submittedByUserId);

    const result = await this.svc.upsert({
      eventDate: input.eventDate,
      latitude: input.latitude,
      longitude: input.longitude,
      state: input.state,
      hailSizeInches: input.hailSizeInches ?? null,
      windMph: input.windMph ?? null,
      tornadoEfRank: input.tornadoEfRank ?? null,
      source,
      sourcePayload: {
        notes: (input.notes || '').slice(0, 1000),
        photo_count: input.photoUrls?.length || 0,
        submitted_by_user_id: input.submittedByUserId,
        submitted_at: new Date().toISOString(),
        is_customer_report: !!input.isCustomerReport,
      },
      repReportPhotoUrls: input.photoUrls,
      repReportSubmittedByUserId: input.submittedByUserId,
      repReportPreApproved: preApproved,
    });

    return {
      id: result.id,
      wasInserted: result.wasInserted,
      verificationCount: result.verificationCount,
      confidenceTier: result.confidenceTier,
      status: preApproved
        ? 'auto_approved'
        : result.wasInserted
          ? 'pending_review'
          : 'merged_with_existing',
    };
  }

  /**
   * Approve a rep report. Called from admin dashboard.
   */
  async approve(eventId: string, approvedByUserId: string): Promise<void> {
    await this.pool.query(
      `UPDATE verified_hail_events
       SET rep_report_verified_by_admin = TRUE,
           rep_report_verified_at = NOW(),
           rep_report_verified_by_user_id = $2,
           last_updated_at = NOW()
       WHERE id = $1
         AND (source_rep_report OR source_customer_report)`,
      [eventId, approvedByUserId]
    );
  }

  async reject(eventId: string, rejectedByUserId: string, reason?: string): Promise<void> {
    await this.pool.query(
      `UPDATE verified_hail_events
       SET rep_report_verified_by_admin = FALSE,
           rep_report_verified_at = NOW(),
           rep_report_verified_by_user_id = $2,
           source_details = source_details || jsonb_build_object('rejection_reason', $3::text, 'rejected_at', NOW()::text),
           last_updated_at = NOW()
       WHERE id = $1
         AND (source_rep_report OR source_customer_report)`,
      [eventId, rejectedByUserId, reason || null]
    );
  }

  /**
   * Pending queue for admin UI.
   */
  async getPendingQueue(limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT
         id, event_date, latitude, longitude, state,
         hail_size_inches, wind_mph, tornado_ef_rank,
         source_rep_report, source_customer_report,
         rep_report_submitted_by_user_id, rep_report_photo_urls,
         rep_report_submitted_at, source_details,
         (source_details->>(CASE WHEN source_rep_report THEN 'rep_report' ELSE 'customer_report' END))::jsonb->>'notes' AS notes
       FROM verified_hail_events
       WHERE (source_rep_report OR source_customer_report)
         AND rep_report_verified_by_admin IS DISTINCT FROM TRUE
       ORDER BY rep_report_submitted_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Trusted-rep policy. For v1: always returns false (all reports require admin).
   * Future: auto-approve after N consecutive approved reports with no rejections.
   */
  private async checkAutoApprove(userId?: string): Promise<boolean> {
    if (!userId) return false;
    if (process.env.REP_AUTO_APPROVE_ENABLED !== 'true') return false;

    // Check user's approval history
    const history = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE rep_report_verified_by_admin = TRUE) AS approved,
         COUNT(*) FILTER (WHERE rep_report_verified_by_admin = FALSE) AS rejected
       FROM verified_hail_events
       WHERE rep_report_submitted_by_user_id = $1`,
      [userId]
    );
    const approved = parseInt(history.rows[0]?.approved || '0', 10);
    const rejected = parseInt(history.rows[0]?.rejected || '0', 10);
    // Auto-approve if: ≥ 10 approved, 0 rejected in history
    return approved >= 10 && rejected === 0;
  }
}
