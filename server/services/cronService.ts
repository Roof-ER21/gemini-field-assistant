/**
 * Cron Service - Scheduled Email Notifications
 * Sends daily summary emails at 5 AM, 12 PM, 7 PM, and 11 PM
 */

import cron from 'node-cron';
import { dailySummaryService } from './dailySummaryService.js';

class CronService {
  private static instance: CronService;
  private jobs: cron.ScheduledTask[] = [];

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
  startAll(): void {
    console.log('🕐 Starting cron jobs for automated email notifications...');

    // Schedule 1: 5:00 AM - Morning Summary
    const job5am = cron.schedule('0 5 * * *', async () => {
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      console.log('\n' + '='.repeat(80));
      console.log(`⏰ [5:00 AM CRON JOB TRIGGERED] - ${now}`);
      console.log('='.repeat(80));
      try {
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [5:00 AM] Morning summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [5:00 AM] Failed to send morning summaries:', error);
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
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [12:00 PM] Midday summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [12:00 PM] Failed to send midday summaries:', error);
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
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [7:00 PM] Evening summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [7:00 PM] Failed to send evening summaries:', error);
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
        const result = await dailySummaryService.sendAllDailySummaries();
        console.log('✅ [11:00 PM] Night summaries completed:', JSON.stringify(result, null, 2));
        console.log('='.repeat(80) + '\n');
      } catch (error) {
        console.error('❌ [11:00 PM] Failed to send night summaries:', error);
        console.log('='.repeat(80) + '\n');
      }
    }, {
      timezone: "America/New_York"
    });

    // Store jobs for later management
    this.jobs = [job5am, job12pm, job7pm, job11pm];

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
      const result = await dailySummaryService.sendAllDailySummaries();
      console.log('✅ Manual trigger completed:', result);
      return result;
    } catch (error) {
      console.error('❌ Manual trigger failed:', error);
      throw error;
    }
  }
}

export const cronService = CronService.getInstance();
