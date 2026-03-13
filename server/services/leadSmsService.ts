/**
 * Lead SMS Follow-Up Service
 *
 * Automated SMS sequences for leads captured through landing pages.
 * - Day 0: Instant confirmation ("Thanks for requesting an inspection...")
 * - Day 3: Check-in ("Just following up...")
 * - Day 7: Final follow-up ("Last chance for free inspection...")
 *
 * TCPA compliant: opt-out via STOP reply, opt-out table checked before every send.
 * Uses the existing TwilioService singleton for actual SMS delivery.
 */

import type { Pool } from 'pg';
import { twilioService } from './twilioService.js';

// ---------------------------------------------------------------------------
// Message Templates
// ---------------------------------------------------------------------------

const COMPANY_NAME = 'The Roof Docs';
const COMPANY_PHONE = '(571) 520-8507';

interface TemplateParams {
  homeownerName: string;
  serviceType?: string;
  zipCode?: string;
}

function day0Message(p: TemplateParams): string {
  const name = p.homeownerName.split(' ')[0]; // First name only
  return (
    `Hi ${name}! This is ${COMPANY_NAME}. ` +
    `We received your request for a free roof inspection. ` +
    `A specialist will reach out within 1 business hour to schedule. ` +
    `Questions? Call us at ${COMPANY_PHONE}.\n\n` +
    `Reply STOP to opt out.`
  );
}

function day3Message(p: TemplateParams): string {
  const name = p.homeownerName.split(' ')[0];
  return (
    `Hi ${name}, just checking in from ${COMPANY_NAME}. ` +
    `We want to make sure you got connected with our team ` +
    `about your roof inspection. ` +
    `If you still need to schedule, reply YES or call ${COMPANY_PHONE}. ` +
    `We're happy to work around your schedule!\n\n` +
    `Reply STOP to opt out.`
  );
}

function day7Message(p: TemplateParams): string {
  const name = p.homeownerName.split(' ')[0];
  return (
    `Hi ${name}, final follow-up from ${COMPANY_NAME}. ` +
    `Your free roof inspection offer is still available. ` +
    `Most storm damage claims must be filed within 12 months — ` +
    `don't miss your window. ` +
    `Call ${COMPANY_PHONE} or reply YES to schedule.\n\n` +
    `Reply STOP to opt out.`
  );
}

const MESSAGE_TEMPLATES: Record<string, (p: TemplateParams) => string> = {
  day0: day0Message,
  day3: day3Message,
  day7: day7Message,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LeadSmsService {
  constructor(private pool: Pool) {}

  /**
   * Enqueue the 3-step follow-up sequence for a new lead.
   * Called from the lead intake endpoint after a successful insert.
   */
  async enqueueSequence(params: {
    leadId: string;
    homeownerName: string;
    homeownerPhone: string;
    serviceType?: string;
    zipCode?: string;
  }): Promise<void> {
    const { leadId, homeownerName, homeownerPhone, serviceType, zipCode } = params;

    // Check opt-out status first
    if (await this.isOptedOut(homeownerPhone)) {
      console.log(`[LeadSMS] Phone ${homeownerPhone} is opted out — skipping sequence`);
      return;
    }

    // Clean phone number via Twilio service
    if (!twilioService.validatePhoneNumber(homeownerPhone)) {
      console.log(`[LeadSMS] Invalid phone ${homeownerPhone} — skipping sequence`);
      return;
    }

    const now = new Date();
    const day3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const day7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Clamp follow-ups to business hours (9 AM - 7 PM Eastern)
    const clampToBusinessHours = (d: Date): Date => {
      const eastern = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const hour = eastern.getHours();
      if (hour < 9) {
        d.setHours(d.getHours() + (9 - hour));
      } else if (hour >= 19) {
        // Push to 9 AM next day
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
      }
      return d;
    };

    const steps = [
      { step: 'day0', scheduledAt: now },  // Immediate
      { step: 'day3', scheduledAt: clampToBusinessHours(day3) },
      { step: 'day7', scheduledAt: clampToBusinessHours(day7) },
    ];

    try {
      for (const { step, scheduledAt } of steps) {
        await this.pool.query(
          `INSERT INTO lead_sms_followups
           (lead_id, phone_number, homeowner_name, sequence_step, scheduled_at, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           ON CONFLICT DO NOTHING`,
          [leadId, homeownerPhone, homeownerName, step, scheduledAt.toISOString()]
        );
      }
      console.log(`[LeadSMS] Enqueued 3-step sequence for lead ${leadId}`);
    } catch (error) {
      console.error('[LeadSMS] Failed to enqueue sequence:', error);
    }

    // Send Day 0 immediately (don't wait for cron)
    try {
      await this.sendFollowUp({
        leadId,
        homeownerName,
        homeownerPhone,
        sequenceStep: 'day0',
        serviceType,
        zipCode,
      });
    } catch (error) {
      console.error('[LeadSMS] Day 0 immediate send failed:', error);
    }
  }

  /**
   * Process all pending follow-ups that are due.
   * Called by a cron endpoint (e.g., every 15 minutes).
   */
  async processPendingFollowups(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const stats = { processed: 0, sent: 0, failed: 0, skipped: 0 };

    if (!twilioService.isConfigured()) {
      console.log('[LeadSMS] Twilio not configured — skipping follow-up processing');
      return stats;
    }

    try {
      // Get all pending follow-ups that are due (but not Day 0 — those are sent immediately)
      const result = await this.pool.query(
        `SELECT f.id, f.lead_id, f.phone_number, f.homeowner_name,
                f.sequence_step, pl.service_type, pl.zip_code
         FROM lead_sms_followups f
         JOIN profile_leads pl ON pl.id = f.lead_id
         WHERE f.status = 'pending'
           AND f.sequence_step != 'day0'
           AND f.scheduled_at <= NOW()
           AND f.opted_out = FALSE
         ORDER BY f.scheduled_at ASC
         LIMIT 50`
      );

      for (const row of result.rows) {
        stats.processed++;

        // Check opt-out before each send
        if (await this.isOptedOut(row.phone_number)) {
          await this.pool.query(
            `UPDATE lead_sms_followups SET status = 'opted_out', opted_out = TRUE WHERE id = $1`,
            [row.id]
          );
          stats.skipped++;
          continue;
        }

        // Check if lead was already converted — skip follow-ups
        const leadStatus = await this.pool.query(
          `SELECT status FROM profile_leads WHERE id = $1`,
          [row.lead_id]
        );
        if (['converted', 'closed'].includes(leadStatus.rows[0]?.status)) {
          await this.pool.query(
            `UPDATE lead_sms_followups SET status = 'skipped' WHERE id = $1`,
            [row.id]
          );
          stats.skipped++;
          continue;
        }

        const sent = await this.sendFollowUp({
          leadId: row.lead_id,
          homeownerName: row.homeowner_name,
          homeownerPhone: row.phone_number,
          sequenceStep: row.sequence_step,
          serviceType: row.service_type,
          zipCode: row.zip_code,
          followupId: row.id,
        });

        if (sent) {
          stats.sent++;
        } else {
          stats.failed++;
        }

        // Rate limit: 1 SMS per second
        await new Promise(r => setTimeout(r, 1100));
      }
    } catch (error) {
      console.error('[LeadSMS] Follow-up processing error:', error);
    }

    if (stats.processed > 0) {
      console.log(
        `[LeadSMS] Processed ${stats.processed}: ` +
        `${stats.sent} sent, ${stats.failed} failed, ${stats.skipped} skipped`
      );
    }

    return stats;
  }

  /**
   * Handle an incoming STOP reply (Twilio webhook).
   */
  async handleOptOut(phoneNumber: string): Promise<void> {
    try {
      // Add to opt-out list
      await this.pool.query(
        `INSERT INTO sms_opt_outs (phone_number, source)
         VALUES ($1, 'reply_stop')
         ON CONFLICT (phone_number) DO NOTHING`,
        [phoneNumber]
      );

      // Mark all pending follow-ups for this phone as opted out
      await this.pool.query(
        `UPDATE lead_sms_followups
         SET status = 'opted_out', opted_out = TRUE
         WHERE phone_number = $1 AND status = 'pending'`,
        [phoneNumber]
      );

      console.log(`[LeadSMS] Phone ${phoneNumber} opted out — all pending follow-ups cancelled`);
    } catch (error) {
      console.error('[LeadSMS] Opt-out processing error:', error);
    }
  }

  /**
   * Get follow-up stats for admin dashboard.
   */
  async getStats(): Promise<{
    totalEnqueued: number;
    totalSent: number;
    totalPending: number;
    totalOptedOut: number;
    byStep: Array<{ step: string; sent: number; pending: number }>;
  }> {
    try {
      const totals = await this.pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'sent') as sent,
           COUNT(*) FILTER (WHERE status = 'pending') as pending,
           COUNT(*) FILTER (WHERE status = 'opted_out') as opted_out
         FROM lead_sms_followups`
      );

      const byStep = await this.pool.query(
        `SELECT
           sequence_step as step,
           COUNT(*) FILTER (WHERE status = 'sent') as sent,
           COUNT(*) FILTER (WHERE status = 'pending') as pending
         FROM lead_sms_followups
         GROUP BY sequence_step
         ORDER BY sequence_step`
      );

      const row = totals.rows[0];
      return {
        totalEnqueued: parseInt(row.total) || 0,
        totalSent: parseInt(row.sent) || 0,
        totalPending: parseInt(row.pending) || 0,
        totalOptedOut: parseInt(row.opted_out) || 0,
        byStep: byStep.rows.map(r => ({
          step: r.step,
          sent: parseInt(r.sent) || 0,
          pending: parseInt(r.pending) || 0,
        })),
      };
    } catch {
      return { totalEnqueued: 0, totalSent: 0, totalPending: 0, totalOptedOut: 0, byStep: [] };
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async isOptedOut(phone: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT 1 FROM sms_opt_outs WHERE phone_number = $1 LIMIT 1`,
        [phone]
      );
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  private async sendFollowUp(params: {
    leadId: string;
    homeownerName: string;
    homeownerPhone: string;
    sequenceStep: string;
    serviceType?: string;
    zipCode?: string;
    followupId?: string;
  }): Promise<boolean> {
    const { homeownerName, homeownerPhone, sequenceStep, serviceType, zipCode, followupId } = params;

    const templateFn = MESSAGE_TEMPLATES[sequenceStep];
    if (!templateFn) {
      console.error(`[LeadSMS] Unknown step: ${sequenceStep}`);
      return false;
    }

    const message = templateFn({ homeownerName, serviceType, zipCode });
    const result = await twilioService.sendSMS(homeownerPhone, message);

    // Update follow-up record
    if (followupId) {
      await this.pool.query(
        `UPDATE lead_sms_followups
         SET status = $1, sent_at = NOW(), message_sid = $2, error_message = $3
         WHERE id = $4`,
        [
          result.success ? 'sent' : 'failed',
          result.messageSid || null,
          result.error || null,
          followupId,
        ]
      ).catch(err => console.error('[LeadSMS] DB update failed:', err));
    } else {
      // Day 0 — update by lead_id + step
      await this.pool.query(
        `UPDATE lead_sms_followups
         SET status = $1, sent_at = NOW(), message_sid = $2, error_message = $3
         WHERE lead_id = $4 AND sequence_step = 'day0' AND status = 'pending'`,
        [
          result.success ? 'sent' : 'failed',
          result.messageSid || null,
          result.error || null,
          params.leadId,
        ]
      ).catch(err => console.error('[LeadSMS] DB update failed:', err));
    }

    return result.success;
  }
}
