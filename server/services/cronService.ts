/**
 * Cron Service - Scheduled Email Notifications
 * Sends daily summary emails at 5 AM, 12 PM, 7 PM, and 11 PM
 */

import cron, { ScheduledTask } from 'node-cron';
import type { Pool } from 'pg';
import { dailySummaryService } from './dailySummaryService.js';
import { createSheetsService } from './sheetsService.js';
import { createPushNotificationService } from './pushNotificationService.js';
import {
  scanForNewStorms,
  sendCalendarReminders,
  sendTaskReminders,
  sendMorningBriefing,
  sendEndOfDaySummary
} from './notificationScheduler.js';
import { watchTerritoriesForStorms } from './nwsTerritoryWatcher.js';

class CronService {
  private static instance: CronService;
  private jobs: ScheduledTask[] = [];

  private constructor() {}

  static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  /**
   * Start all scheduled jobs
   */
  startAll(pool?: Pool): void {
    console.log('🕐 Starting cron jobs for automated email notifications...');

    // Schedule 1: 5:00 AM - Morning Summary
    const job5am = cron.schedule('0 5 * * *', async () => {
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      console.log('\n' + '='.repeat(80));
      console.log(`⏰ [5:00 AM CRON JOB TRIGGERED] - ${now}`);
      console.log('='.repeat(80));
      try {
        // Send admin aggregate summary
        const adminResult = await dailySummaryService.sendAdminDailySummary();
        console.log('✅ [5:00 AM] Admin summary:', adminResult.success ? 'Sent' : 'Skipped/Failed');

        // Send individual user summaries (optional - can be disabled)
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [5:00 AM] User summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [5:00 AM] Failed to send summaries:', error);
        console.log('='.repeat(80) + '\n');
      }
    }, {
      timezone: "America/New_York" // Adjust to your timezone
    });

    // Schedule 2: 12:00 PM - Midday Summary
    const job12pm = cron.schedule('0 12 * * *', async () => {
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      console.log('\n' + '='.repeat(80));
      console.log(`⏰ [12:00 PM CRON JOB TRIGGERED] - ${now}`);
      console.log('='.repeat(80));
      try {
        // Send admin aggregate summary
        const adminResult = await dailySummaryService.sendAdminDailySummary();
        console.log('✅ [12:00 PM] Admin summary:', adminResult.success ? 'Sent' : 'Skipped/Failed');

        // Send individual user summaries
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [12:00 PM] User summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [12:00 PM] Failed to send summaries:', error);
        console.log('='.repeat(80) + '\n');
      }
    }, {
      timezone: "America/New_York"
    });

    // Schedule 3: 7:00 PM - Evening Summary
    const job7pm = cron.schedule('0 19 * * *', async () => {
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      console.log('\n' + '='.repeat(80));
      console.log(`⏰ [7:00 PM CRON JOB TRIGGERED] - ${now}`);
      console.log('='.repeat(80));
      try {
        // Send admin aggregate summary
        const adminResult = await dailySummaryService.sendAdminDailySummary();
        console.log('✅ [7:00 PM] Admin summary:', adminResult.success ? 'Sent' : 'Skipped/Failed');

        // Send individual user summaries
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [7:00 PM] User summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [7:00 PM] Failed to send summaries:', error);
        console.log('='.repeat(80) + '\n');
      }
    }, {
      timezone: "America/New_York"
    });

    // Schedule 4: 11:00 PM - Night Summary
    const job11pm = cron.schedule('0 23 * * *', async () => {
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      console.log('\n' + '='.repeat(80));
      console.log(`⏰ [11:00 PM CRON JOB TRIGGERED] - ${now}`);
      console.log('='.repeat(80));
      try {
        // Send admin aggregate summary
        const adminResult = await dailySummaryService.sendAdminDailySummary();
        console.log('✅ [11:00 PM] Admin summary:', adminResult.success ? 'Sent' : 'Skipped/Failed');

        // Send individual user summaries
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [11:00 PM] User summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [11:00 PM] Failed to send summaries:', error);
        console.log('='.repeat(80) + '\n');
      }
    }, {
      timezone: "America/New_York"
    });

    const jobs: ScheduledTask[] = [job5am, job12pm, job7pm, job11pm];

    const hasSheetsCreds = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
    if (!pool) {
      console.warn('⚠️  Sheets sync not scheduled: database pool unavailable');
    } else if (!hasSheetsCreds) {
      console.warn('⚠️  Sheets sync not scheduled: Google Sheets credentials missing');
    } else {
      const sheetsJob = cron.schedule(
        '0 8,20 * * *',
        async () => {
          console.log('⏰ [SHEETS] Starting Google Sheets sync...');
          try {
            const sheetsService = createSheetsService(pool);
            const result = await sheetsService.performFullSync();
            if (result.success) {
              console.log(`✅ [SHEETS] Synced ${result.synced} of ${result.total} reps`);
            } else {
              console.error(`❌ [SHEETS] Sync failed: ${result.error || result.message}`);
            }
          } catch (error) {
            console.error('❌ [SHEETS] Sync failed:', error);
          }
        },
        { timezone: 'America/New_York' }
      );
      jobs.push(sheetsJob);
      console.log('📊 Google Sheets sync scheduled for 8:00 AM and 8:00 PM (America/New_York)');
    }

    // ─── Push Notification Cron Jobs ───────────────────────────────────
    if (pool) {
      const pushService = createPushNotificationService(pool);

      // Every 15 minutes: Storm alert scanner + calendar/task reminders
      const pushScanJob = cron.schedule('*/15 * * * *', async () => {
        try {
          const [storms, nwsWatch, calendar, tasks] = await Promise.all([
            scanForNewStorms(pool, pushService),
            watchTerritoriesForStorms(pool).catch(e => { console.error('[NWSWatcher]', e.message); return { territoriesChecked: 0, newAlerts: 0, eventsCreated: 0, errors: 1 }; }),
            sendCalendarReminders(pool, pushService),
            sendTaskReminders(pool, pushService)
          ]);
          const total = storms.alertsSent + calendar.remindersSent + tasks.remindersSent;
          if (total > 0 || nwsWatch.eventsCreated > 0) {
            console.log(`📲 [Push Scan] Storms: ${storms.alertsSent}, NWS Watch: ${nwsWatch.eventsCreated} new, Calendar: ${calendar.remindersSent}, Tasks: ${tasks.remindersSent}`);
          }
        } catch (err) {
          console.error('❌ [Push Scan] Error:', (err as Error).message);
        }
      }, { timezone: 'America/New_York' });
      jobs.push(pushScanJob);

      // Daily 7:00 AM: Morning briefing push
      const morningBriefingJob = cron.schedule('0 7 * * *', async () => {
        console.log('⏰ [7:00 AM] Morning briefing push...');
        try {
          const result = await sendMorningBriefing(pool, pushService);
          console.log(`✅ [7:00 AM] Morning briefing sent to ${result.sent} users`);
        } catch (err) {
          console.error('❌ [7:00 AM] Morning briefing failed:', err);
        }
      }, { timezone: 'America/New_York' });
      jobs.push(morningBriefingJob);

      // Daily 6:00 PM: End-of-day summary push
      const eodSummaryJob = cron.schedule('0 18 * * *', async () => {
        console.log('⏰ [6:00 PM] End-of-day summary push...');
        try {
          const result = await sendEndOfDaySummary(pool, pushService);
          console.log(`✅ [6:00 PM] EOD summary sent to ${result.sent} users`);
        } catch (err) {
          console.error('❌ [6:00 PM] EOD summary failed:', err);
        }
      }, { timezone: 'America/New_York' });
      jobs.push(eodSummaryJob);

      console.log('📲 Push notification cron jobs scheduled:');
      console.log('   - Every 15 min: Storm alerts + Calendar/Task reminders');
      console.log('   - 7:00 AM: Morning briefing');
      console.log('   - 6:00 PM: End-of-day summary');
    }

    // Store jobs for later management
    this.jobs = jobs;

    console.log('✅ Cron jobs started successfully!');
    console.log('📧 Daily summary emails scheduled for:');
    console.log('   - 5:00 AM (Morning)');
    console.log('   - 12:00 PM (Midday)');
    console.log('   - 7:00 PM (Evening)');
    console.log('   - 11:00 PM (Night)');
    console.log('   Timezone: America/New_York');
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll(): void {
    console.log('🛑 Stopping all cron jobs...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('✅ All cron jobs stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus(): { total: number; running: number } {
    return {
      total: this.jobs.length,
      running: this.jobs.filter(job => job !== null).length
    };
  }

  /**
   * Trigger a manual run (for testing)
   */
  async runManually(): Promise<any> {
    console.log('🔧 Manual cron job trigger...');
    try {
      // Send admin aggregate summary
      const adminResult = await dailySummaryService.sendAdminDailySummary();
      console.log('✅ Admin summary:', adminResult.success ? 'Sent' : 'Skipped/Failed');

      // Send individual user summaries
      const result = await dailySummaryService.sendAllDailySummaries();
      console.log('✅ Manual trigger completed:', result);
      return { adminResult, userResults: result };
    } catch (error) {
      console.error('❌ Manual trigger failed:', error);
      throw error;
    }
  }

  /**
   * Trigger admin summary only (for testing)
   */
  async runAdminSummaryManually(): Promise<any> {
    console.log('🔧 Manual admin summary trigger...');
    try {
      const result = await dailySummaryService.sendAdminDailySummary();
      console.log('✅ Admin summary trigger completed:', result.success ? 'Sent' : 'Skipped/Failed');
      return result;
    } catch (error) {
      console.error('❌ Admin summary trigger failed:', error);
      throw error;
    }
  }
}

export const cronService = CronService.getInstance();
