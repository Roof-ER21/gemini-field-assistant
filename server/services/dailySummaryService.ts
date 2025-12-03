/**
 * Daily Summary Service
 * Aggregates user activity and sends end-of-day summary emails
 * Supports manual triggers and scheduled execution (via cron)
 */

import pg from 'pg';
const { Pool } = pg;

// Email service import
import { emailService, type EmailTemplate } from './emailService.js';

interface ActivityData {
  message?: string;
  documentName?: string;
  documentPath?: string;
  emailType?: string;
  transcriptionDuration?: number;
  [key: string]: any;
}

interface ActivityLog {
  id: number;
  user_id: number;
  activity_type: string;
  activity_data: ActivityData | null;
  created_at: Date;
}

interface UserDailySummary {
  userId: number;
  userEmail: string;
  userName: string;
  state: string | null;
  date: string;
  loginCount: number;
  chatCount: number;
  documentCount: number;
  emailGeneratedCount: number;
  transcriptionCount: number;
  firstActivity: Date;
  lastActivity: Date;
  topDocuments: Array<{ name: string; views: number }>;
  chatPreview: string[];
}

interface AdminDailySummary {
  date: string;
  totalUsers: number;
  totalActivities: number;
  totals: {
    logins: number;
    chats: number;
    documents: number;
    emails: number;
    transcriptions: number;
  };
  userBreakdown: Array<{
    name: string;
    email: string;
    state: string | null;
    logins: number;
    chats: number;
    documents: number;
    emails: number;
    transcriptions: number;
    totalActivities: number;
  }>;
  errors: Array<{
    type: string;
    email: string;
    error: string;
    timestamp: Date;
  }>;
}

class DailySummaryService {
  private static instance: DailySummaryService;
  private pool: pg.Pool;

  private constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  static getInstance(): DailySummaryService {
    if (!DailySummaryService.instance) {
      DailySummaryService.instance = new DailySummaryService();
    }
    return DailySummaryService.instance;
  }

  /**
   * Get daily activity summary for a specific user
   */
  async getDailySummary(userId: number, date?: string): Promise<UserDailySummary | null> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      // Get user info
      const userResult = await this.pool.query(
        'SELECT id, email, name, state FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        console.warn(`User ${userId} not found`);
        return null;
      }

      const user = userResult.rows[0];

      // Get all activities for the day
      const activitiesResult = await this.pool.query<ActivityLog>(
        `SELECT id, user_id, activity_type, activity_data, created_at
         FROM user_activity_log
         WHERE user_id = $1 AND DATE(created_at) = $2
         ORDER BY created_at ASC`,
        [userId, targetDate]
      );

      const activities = activitiesResult.rows;

      if (activities.length === 0) {
        console.log(`No activities found for user ${userId} on ${targetDate}`);
        return null;
      }

      // Aggregate activity counts
      const loginCount = activities.filter(a => a.activity_type === 'login').length;
      const chatCount = activities.filter(a => a.activity_type === 'chat').length;
      const documentCount = activities.filter(a => a.activity_type === 'document_analysis').length;
      const emailGeneratedCount = activities.filter(a => a.activity_type === 'email_generated').length;
      const transcriptionCount = activities.filter(a => a.activity_type === 'transcription').length;

      // Get top documents
      const documentActivities = activities.filter(a =>
        a.activity_type === 'document_analysis' && a.activity_data?.documentName
      );
      const documentMap = new Map<string, number>();
      documentActivities.forEach(a => {
        const name = a.activity_data?.documentName || 'Unknown';
        documentMap.set(name, (documentMap.get(name) || 0) + 1);
      });
      const topDocuments = Array.from(documentMap.entries())
        .map(([name, views]) => ({ name, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);

      // Get chat message previews (first 3 messages)
      const chatActivities = activities.filter(a =>
        a.activity_type === 'chat' && a.activity_data?.message
      );
      const chatPreview = chatActivities
        .slice(0, 3)
        .map(a => {
          const msg = a.activity_data?.message || '';
          return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
        });

      return {
        userId: user.id,
        userEmail: user.email,
        userName: user.name || user.email.split('@')[0],
        state: user.state,
        date: targetDate,
        loginCount,
        chatCount,
        documentCount,
        emailGeneratedCount,
        transcriptionCount,
        firstActivity: activities[0].created_at,
        lastActivity: activities[activities.length - 1].created_at,
        topDocuments,
        chatPreview
      };
    } catch (error) {
      console.error('Error getting daily summary:', error);
      throw error;
    }
  }

  /**
   * Generate HTML email template for daily summary
   */
  private generateDailySummaryEmail(summary: UserDailySummary): { subject: string; html: string; text: string } {
    const totalActivities = summary.loginCount + summary.chatCount + summary.documentCount +
                           summary.emailGeneratedCount + summary.transcriptionCount;

    const subject = `📊 Daily Summary - ${summary.userName} (${summary.date})`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Daily Summary</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .header .date { margin-top: 8px; font-size: 14px; opacity: 0.9; }
          .content { padding: 30px 20px; }
          .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { background: #f8f9fa; border-left: 4px solid #ef4444; padding: 15px; border-radius: 6px; }
          .stat-number { font-size: 32px; font-weight: 700; color: #ef4444; margin: 0; }
          .stat-label { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; }
          .section { margin: 25px 0; }
          .section-title { font-size: 18px; font-weight: 600; color: #333; margin-bottom: 12px; border-bottom: 2px solid #ef4444; padding-bottom: 8px; }
          .document-list { list-style: none; padding: 0; margin: 0; }
          .document-item { background: #f8f9fa; padding: 10px 15px; margin: 8px 0; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
          .doc-name { font-weight: 500; color: #333; }
          .doc-views { background: #ef4444; color: white; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          .chat-preview { background: #e3f2fd; border-left: 3px solid #2196f3; padding: 12px 15px; margin: 8px 0; border-radius: 4px; font-size: 13px; color: #333; font-style: italic; }
          .time-info { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; display: flex; justify-content: space-between; }
          .time-item { text-align: center; }
          .time-label { font-size: 12px; color: #666; text-transform: uppercase; }
          .time-value { font-size: 14px; font-weight: 600; color: #333; margin-top: 5px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #e0e0e0; }
          .badge { display: inline-block; padding: 4px 10px; background: #ef4444; color: white; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Daily Activity Summary</h1>
            <div class="date">${summary.date}</div>
            ${summary.state ? `<div class="badge">${summary.state}</div>` : ''}
          </div>
          <div class="content">
            <p>Hi <strong>${summary.userName}</strong>,</p>
            <p>Here's your activity summary for today. You had <strong>${totalActivities} total activities</strong>.</p>

            <div class="summary-grid">
              <div class="stat-card">
                <div class="stat-number">${summary.chatCount}</div>
                <div class="stat-label">Chat Messages</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${summary.documentCount}</div>
                <div class="stat-label">Documents Viewed</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${summary.emailGeneratedCount}</div>
                <div class="stat-label">Emails Generated</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${summary.loginCount}</div>
                <div class="stat-label">Login Sessions</div>
              </div>
            </div>

            ${summary.topDocuments.length > 0 ? `
            <div class="section">
              <div class="section-title">📄 Top Documents</div>
              <ul class="document-list">
                ${summary.topDocuments.map(doc => `
                <li class="document-item">
                  <span class="doc-name">${doc.name}</span>
                  <span class="doc-views">${doc.views} ${doc.views === 1 ? 'view' : 'views'}</span>
                </li>
                `).join('')}
              </ul>
            </div>
            ` : ''}

            ${summary.chatPreview.length > 0 ? `
            <div class="section">
              <div class="section-title">💬 Recent Chat Activity</div>
              ${summary.chatPreview.map(msg => `
                <div class="chat-preview">"${msg}"</div>
              `).join('')}
            </div>
            ` : ''}

            <div class="time-info">
              <div class="time-item">
                <div class="time-label">First Activity</div>
                <div class="time-value">${new Date(summary.firstActivity).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div class="time-item">
                <div class="time-label">Last Activity</div>
                <div class="time-value">${new Date(summary.lastActivity).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            <p style="margin-top: 25px; color: #666; font-size: 14px;">
              Keep up the great work! 🚀
            </p>
          </div>
          <div class="footer">
            <p style="margin: 5px 0;">S21 Field AI Assistant</p>
            <p style="margin: 5px 0; font-size: 12px;">Powered by ROOFER - The Roof Docs</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
📊 DAILY ACTIVITY SUMMARY - ${summary.date}

Hi ${summary.userName},

Here's your activity summary for today. You had ${totalActivities} total activities.

ACTIVITY BREAKDOWN:
- Chat Messages: ${summary.chatCount}
- Documents Viewed: ${summary.documentCount}
- Emails Generated: ${summary.emailGeneratedCount}
- Login Sessions: ${summary.loginCount}
${summary.transcriptionCount > 0 ? `- Transcriptions: ${summary.transcriptionCount}` : ''}

${summary.topDocuments.length > 0 ? `
TOP DOCUMENTS:
${summary.topDocuments.map(doc => `  • ${doc.name} (${doc.views} ${doc.views === 1 ? 'view' : 'views'})`).join('\n')}
` : ''}

${summary.chatPreview.length > 0 ? `
RECENT CHAT ACTIVITY:
${summary.chatPreview.map(msg => `  "${msg}"`).join('\n')}
` : ''}

TIME INFO:
First Activity: ${new Date(summary.firstActivity).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
Last Activity: ${new Date(summary.lastActivity).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}

Keep up the great work! 🚀

---
S21 Field AI Assistant
Powered by ROOFER - The Roof Docs
    `.trim();

    return { subject, html, text };
  }

  /**
   * Send daily summary email to a specific user
   */
  async sendDailySummaryEmail(userId: number, date?: string): Promise<boolean> {
    try {
      // Check if already sent today
      const targetDate = date || new Date().toISOString().split('T')[0];
      const alreadySent = await this.pool.query(
        `SELECT id FROM email_notifications
         WHERE user_id = $1 AND notification_type = 'daily_summary' AND DATE(sent_at) = $2`,
        [userId, targetDate]
      );

      if (alreadySent.rows.length > 0) {
        console.log(`Daily summary already sent to user ${userId} for ${targetDate}`);
        return false;
      }

      // Get summary data
      const summary = await this.getDailySummary(userId, date);

      if (!summary) {
        console.log(`No activity to summarize for user ${userId}`);
        return false;
      }

      // Generate email
      const emailTemplate = this.generateDailySummaryEmail(summary);

      // Send via email service (using existing emailService)
      try {
        // Use the existing email service's internal sendEmail method
        // Since it's private, we'll use a workaround by calling through the notification endpoint
        const success = await this.sendEmailViaService(
          summary.userEmail,
          emailTemplate.subject,
          emailTemplate.html,
          emailTemplate.text
        );

        // Log to email_notifications table
        await this.pool.query(
          `INSERT INTO email_notifications (notification_type, recipient_email, user_id, email_data, success)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'daily_summary',
            summary.userEmail,
            userId,
            JSON.stringify({
              subject: emailTemplate.subject,
              date: targetDate,
              activityCount: summary.chatCount + summary.documentCount + summary.emailGeneratedCount
            }),
            success
          ]
        );

        console.log(`✅ Daily summary email sent to ${summary.userEmail}`);
        return true;
      } catch (error) {
        console.error('Error sending daily summary email:', error);

        // Log failure to database
        await this.pool.query(
          `INSERT INTO email_notifications (notification_type, recipient_email, user_id, email_data, success, error_message)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'daily_summary',
            summary.userEmail,
            userId,
            JSON.stringify({ subject: emailTemplate.subject, date: targetDate }),
            false,
            (error as Error).message
          ]
        );

        return false;
      }
    } catch (error) {
      console.error('Error in sendDailySummaryEmail:', error);
      return false;
    }
  }

  /**
   * Send email via the existing email service
   */
  private async sendEmailViaService(to: string, subject: string, html: string, text: string): Promise<boolean> {
    try {
      const template: EmailTemplate = { subject, html, text };
      return await emailService.sendCustomEmail(to, template);
    } catch (error) {
      console.error('❌ Error in sendEmailViaService:', error);
      return false;
    }
  }

  /**
   * Send daily summaries to all active users
   */
  async sendAllDailySummaries(date?: string): Promise<{ sent: number; failed: number; skipped: number }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log(`\n📊 Starting daily summary job for ${targetDate}...`);

    try {
      // Get all users who had activity today
      const result = await this.pool.query<{ user_id: number; activity_count: number }>(
        `SELECT DISTINCT user_id, COUNT(*) as activity_count
         FROM user_activity_log
         WHERE DATE(created_at) = $1
         GROUP BY user_id
         HAVING COUNT(*) > 0`,
        [targetDate]
      );

      const users = result.rows;
      console.log(`Found ${users.length} users with activity today`);

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const user of users) {
        try {
          const success = await this.sendDailySummaryEmail(user.user_id, targetDate);
          if (success) {
            sent++;
          } else {
            skipped++;
          }
        } catch (error) {
          console.error(`Failed to send summary to user ${user.user_id}:`, error);
          failed++;
        }
      }

      console.log(`\n✅ Daily summary job completed:`);
      console.log(`   - Sent: ${sent}`);
      console.log(`   - Skipped: ${skipped}`);
      console.log(`   - Failed: ${failed}`);
      console.log(`   - Total: ${users.length}\n`);

      return { sent, failed, skipped };
    } catch (error) {
      console.error('Error in sendAllDailySummaries:', error);
      throw error;
    }
  }

  /**
   * Get aggregate admin daily summary with ALL users' activity
   */
  async getAdminDailySummary(date?: string): Promise<AdminDailySummary> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    try {
      // Get all users with activity today aggregated by type
      const usersResult = await this.pool.query<{
        id: number;
        name: string;
        email: string;
        state: string | null;
        logins: string;
        chats: string;
        documents: string;
        emails: string;
        transcriptions: string;
        total: string;
      }>(
        `SELECT
          u.id, u.name, u.email, u.state,
          COUNT(CASE WHEN al.activity_type = 'login' THEN 1 END)::text as logins,
          COUNT(CASE WHEN al.activity_type = 'chat' THEN 1 END)::text as chats,
          COUNT(CASE WHEN al.activity_type = 'document_analysis' THEN 1 END)::text as documents,
          COUNT(CASE WHEN al.activity_type = 'email_generated' THEN 1 END)::text as emails,
          COUNT(CASE WHEN al.activity_type = 'transcription' THEN 1 END)::text as transcriptions,
          COUNT(*)::text as total
        FROM users u
        INNER JOIN user_activity_log al ON u.id = al.user_id
        WHERE DATE(al.created_at) = $1
        GROUP BY u.id, u.name, u.email, u.state
        ORDER BY COUNT(*) DESC`,
        [targetDate]
      );

      // Get any email errors from today
      const errorsResult = await this.pool.query<{
        notification_type: string;
        recipient_email: string;
        error_message: string;
        sent_at: Date;
      }>(
        `SELECT notification_type, recipient_email, error_message, sent_at
         FROM email_notifications
         WHERE DATE(sent_at) = $1 AND success = false
         ORDER BY sent_at DESC
         LIMIT 20`,
        [targetDate]
      );

      // Build user breakdown
      const userBreakdown = usersResult.rows.map(user => ({
        name: user.name || user.email.split('@')[0],
        email: user.email,
        state: user.state,
        logins: parseInt(user.logins) || 0,
        chats: parseInt(user.chats) || 0,
        documents: parseInt(user.documents) || 0,
        emails: parseInt(user.emails) || 0,
        transcriptions: parseInt(user.transcriptions) || 0,
        totalActivities: parseInt(user.total) || 0
      }));

      // Calculate totals
      const totals = userBreakdown.reduce((acc, user) => ({
        logins: acc.logins + user.logins,
        chats: acc.chats + user.chats,
        documents: acc.documents + user.documents,
        emails: acc.emails + user.emails,
        transcriptions: acc.transcriptions + user.transcriptions
      }), { logins: 0, chats: 0, documents: 0, emails: 0, transcriptions: 0 });

      // Build errors array
      const errors = errorsResult.rows.map(err => ({
        type: err.notification_type,
        email: err.recipient_email,
        error: err.error_message || 'Unknown error',
        timestamp: err.sent_at
      }));

      return {
        date: targetDate,
        totalUsers: userBreakdown.length,
        totalActivities: userBreakdown.reduce((sum, u) => sum + u.totalActivities, 0),
        totals,
        userBreakdown,
        errors
      };
    } catch (error) {
      console.error('Error getting admin daily summary:', error);
      throw error;
    }
  }

  /**
   * Generate HTML email template for admin summary
   */
  private generateAdminSummaryEmail(summary: AdminDailySummary): { subject: string; html: string; text: string } {
    const subject = `📊 Admin Daily Summary - ${summary.date} | ${summary.totalUsers} Active Users`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Daily Summary</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 700px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .header .date { margin-top: 8px; font-size: 14px; opacity: 0.9; }
          .content { padding: 30px 20px; }
          .overview-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
          .overview-card { background: #f8f9fa; border-top: 4px solid #3b82f6; padding: 20px; border-radius: 6px; text-align: center; }
          .overview-card.highlight { border-top-color: #10b981; background: #ecfdf5; }
          .overview-number { font-size: 36px; font-weight: 700; color: #1e40af; margin: 0; }
          .overview-label { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; }
          .section { margin: 30px 0; }
          .section-title { font-size: 18px; font-weight: 600; color: #333; margin-bottom: 15px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
          .feature-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
          .feature-item { background: #f8f9fa; padding: 15px 10px; border-radius: 6px; text-align: center; }
          .feature-number { font-size: 24px; font-weight: 700; color: #3b82f6; }
          .feature-label { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 12px 10px; text-align: left; border-bottom: 1px solid #e0e0e0; }
          th { background: #f8f9fa; font-weight: 600; color: #333; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { font-size: 14px; }
          .state-badge { display: inline-block; padding: 3px 8px; background: #dbeafe; color: #1e40af; border-radius: 10px; font-size: 11px; font-weight: 600; }
          .activity-badge { display: inline-block; padding: 3px 8px; background: #10b981; color: white; border-radius: 10px; font-size: 11px; font-weight: 600; }
          .error-section { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 15px; margin: 20px 0; }
          .error-title { color: #dc2626; font-weight: 600; margin-bottom: 10px; }
          .error-item { background: white; padding: 10px; margin: 8px 0; border-radius: 4px; border-left: 3px solid #dc2626; font-size: 13px; }
          .no-errors { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 15px; text-align: center; color: #059669; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #e0e0e0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Admin Daily Summary</h1>
            <div class="date">${summary.date}</div>
          </div>
          <div class="content">
            <div class="overview-grid">
              <div class="overview-card highlight">
                <div class="overview-number">${summary.totalUsers}</div>
                <div class="overview-label">Active Users</div>
              </div>
              <div class="overview-card">
                <div class="overview-number">${summary.totalActivities}</div>
                <div class="overview-label">Total Activities</div>
              </div>
              <div class="overview-card">
                <div class="overview-number">${summary.errors.length}</div>
                <div class="overview-label">Errors Today</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Feature Usage Breakdown</div>
              <div class="feature-grid">
                <div class="feature-item">
                  <div class="feature-number">${summary.totals.logins}</div>
                  <div class="feature-label">Logins</div>
                </div>
                <div class="feature-item">
                  <div class="feature-number">${summary.totals.chats}</div>
                  <div class="feature-label">Chats</div>
                </div>
                <div class="feature-item">
                  <div class="feature-number">${summary.totals.documents}</div>
                  <div class="feature-label">Documents</div>
                </div>
                <div class="feature-item">
                  <div class="feature-number">${summary.totals.emails}</div>
                  <div class="feature-label">Emails</div>
                </div>
                <div class="feature-item">
                  <div class="feature-number">${summary.totals.transcriptions}</div>
                  <div class="feature-label">Transcripts</div>
                </div>
              </div>
            </div>

            ${summary.userBreakdown.length > 0 ? `
            <div class="section">
              <div class="section-title">User Activity Breakdown</div>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>State</th>
                    <th>Logins</th>
                    <th>Chats</th>
                    <th>Docs</th>
                    <th>Emails</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${summary.userBreakdown.map(user => `
                  <tr>
                    <td><strong>${user.name}</strong><br><span style="font-size: 11px; color: #666;">${user.email}</span></td>
                    <td>${user.state ? `<span class="state-badge">${user.state}</span>` : '-'}</td>
                    <td>${user.logins}</td>
                    <td>${user.chats}</td>
                    <td>${user.documents}</td>
                    <td>${user.emails}</td>
                    <td><span class="activity-badge">${user.totalActivities}</span></td>
                  </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : '<p style="text-align: center; color: #666;">No user activity recorded today.</p>'}

            ${summary.errors.length > 0 ? `
            <div class="error-section">
              <div class="error-title">⚠️ Errors & Issues (${summary.errors.length})</div>
              ${summary.errors.slice(0, 10).map(err => `
              <div class="error-item">
                <strong>${err.type}</strong> → ${err.email}<br>
                <span style="color: #666;">${err.error}</span>
              </div>
              `).join('')}
              ${summary.errors.length > 10 ? `<p style="text-align: center; color: #666; font-size: 12px;">...and ${summary.errors.length - 10} more errors</p>` : ''}
            </div>
            ` : `
            <div class="no-errors">
              ✅ No errors recorded today - all systems running smoothly!
            </div>
            `}
          </div>
          <div class="footer">
            <p style="margin: 5px 0;">S21 Field AI Assistant - Admin Report</p>
            <p style="margin: 5px 0; font-size: 12px;">Powered by ROOFER - The Roof Docs</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
📊 ADMIN DAILY SUMMARY - ${summary.date}
${'='.repeat(50)}

OVERVIEW:
- Active Users: ${summary.totalUsers}
- Total Activities: ${summary.totalActivities}
- Errors Today: ${summary.errors.length}

FEATURE USAGE:
- Logins: ${summary.totals.logins}
- Chat Messages: ${summary.totals.chats}
- Documents Viewed: ${summary.totals.documents}
- Emails Generated: ${summary.totals.emails}
- Transcriptions: ${summary.totals.transcriptions}

USER BREAKDOWN:
${summary.userBreakdown.map(u =>
  `• ${u.name} (${u.state || 'N/A'}) - ${u.totalActivities} activities [Chats: ${u.chats}, Docs: ${u.documents}]`
).join('\n')}

${summary.errors.length > 0 ? `
ERRORS & ISSUES:
${summary.errors.slice(0, 10).map(e => `• ${e.type}: ${e.email} - ${e.error}`).join('\n')}
` : 'No errors recorded today.'}

---
S21 Field AI Assistant - Admin Report
Powered by ROOFER - The Roof Docs
    `.trim();

    return { subject, html, text };
  }

  /**
   * Send admin daily summary to EMAIL_ADMIN_ADDRESS
   */
  async sendAdminDailySummary(date?: string): Promise<{ success: boolean; summary: AdminDailySummary | null; error?: string }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const adminEmail = process.env.EMAIL_ADMIN_ADDRESS;

    console.log(`\n📊 [ADMIN SUMMARY] Starting admin daily summary for ${targetDate}...`);

    if (!adminEmail) {
      console.error('❌ EMAIL_ADMIN_ADDRESS not configured');
      return { success: false, summary: null, error: 'EMAIL_ADMIN_ADDRESS not configured' };
    }

    try {
      // Get aggregate summary data
      const summary = await this.getAdminDailySummary(targetDate);

      if (summary.totalUsers === 0) {
        console.log(`ℹ️ No user activity on ${targetDate}, skipping admin summary`);
        return { success: true, summary, error: 'No activity to report' };
      }

      // Generate email
      const emailTemplate = this.generateAdminSummaryEmail(summary);

      // Send to admin
      const success = await this.sendEmailViaService(
        adminEmail,
        emailTemplate.subject,
        emailTemplate.html,
        emailTemplate.text
      );

      // Log to email_notifications
      await this.pool.query(
        `INSERT INTO email_notifications (notification_type, recipient_email, email_data, success)
         VALUES ($1, $2, $3, $4)`,
        [
          'admin_daily_summary',
          adminEmail,
          JSON.stringify({
            date: targetDate,
            totalUsers: summary.totalUsers,
            totalActivities: summary.totalActivities,
            errorsCount: summary.errors.length
          }),
          success
        ]
      );

      if (success) {
        console.log(`✅ [ADMIN SUMMARY] Sent to ${adminEmail}`);
        console.log(`   - Users: ${summary.totalUsers}`);
        console.log(`   - Activities: ${summary.totalActivities}`);
        console.log(`   - Errors: ${summary.errors.length}`);
      } else {
        console.error(`❌ [ADMIN SUMMARY] Failed to send to ${adminEmail}`);
      }

      return { success, summary };
    } catch (error) {
      console.error('❌ [ADMIN SUMMARY] Error:', error);
      return { success: false, summary: null, error: (error as Error).message };
    }
  }

  /**
   * Schedule daily summary job (to be called by cron or scheduler)
   */
  scheduleDailySummary(hour: number = 18, minute: number = 0): void {
    console.log(`📅 Daily summary scheduled for ${hour}:${minute.toString().padStart(2, '0')} daily`);

    // Simple interval-based scheduler (in production, use node-cron or similar)
    const checkInterval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === hour && now.getMinutes() === minute) {
        console.log('⏰ Triggering daily summary job...');
        this.sendAllDailySummaries().catch(err => {
          console.error('Daily summary job failed:', err);
        });
      }
    }, 60000); // Check every minute

    console.log('✅ Daily summary scheduler started');
  }
}

// Export singleton instance
export const dailySummaryService = DailySummaryService.getInstance();
