/**
 * Daily Summary Service
 * Aggregates user activity and sends end-of-day summary emails
 * Supports manual triggers and scheduled execution (via cron)
 */
import pg from 'pg';
const { Pool } = pg;
// Email service import
import { emailService } from './emailService.js';
class DailySummaryService {
    static instance;
    pool;
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }
    static getInstance() {
        if (!DailySummaryService.instance) {
            DailySummaryService.instance = new DailySummaryService();
        }
        return DailySummaryService.instance;
    }
    /**
     * Get daily activity summary for a specific user
     */
    async getDailySummary(userId, date) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];
            // Get user info
            const userResult = await this.pool.query('SELECT id, email, name, state FROM users WHERE id = $1', [userId]);
            if (userResult.rows.length === 0) {
                console.warn(`User ${userId} not found`);
                return null;
            }
            const user = userResult.rows[0];
            // Get all activities for the day
            const activitiesResult = await this.pool.query(`SELECT id, user_id, activity_type, activity_data, created_at
         FROM user_activity_log
         WHERE user_id = $1 AND DATE(created_at) = $2
         ORDER BY created_at ASC`, [userId, targetDate]);
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
            const documentActivities = activities.filter(a => a.activity_type === 'document_analysis' && a.activity_data?.documentName);
            const documentMap = new Map();
            documentActivities.forEach(a => {
                const name = a.activity_data?.documentName || 'Unknown';
                documentMap.set(name, (documentMap.get(name) || 0) + 1);
            });
            const topDocuments = Array.from(documentMap.entries())
                .map(([name, views]) => ({ name, views }))
                .sort((a, b) => b.views - a.views)
                .slice(0, 5);
            // Get chat message previews (first 3 messages)
            const chatActivities = activities.filter(a => a.activity_type === 'chat' && a.activity_data?.message);
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
        }
        catch (error) {
            console.error('Error getting daily summary:', error);
            throw error;
        }
    }
    /**
     * Generate HTML email template for daily summary
     */
    generateDailySummaryEmail(summary) {
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
    async sendDailySummaryEmail(userId, date) {
        try {
            // Check if already sent today
            const targetDate = date || new Date().toISOString().split('T')[0];
            const alreadySent = await this.pool.query(`SELECT id FROM email_notifications
         WHERE user_id = $1 AND notification_type = 'daily_summary' AND DATE(sent_at) = $2`, [userId, targetDate]);
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
                const success = await this.sendEmailViaService(summary.userEmail, emailTemplate.subject, emailTemplate.html, emailTemplate.text);
                // Log to email_notifications table
                await this.pool.query(`INSERT INTO email_notifications (notification_type, recipient_email, user_id, email_data, success)
           VALUES ($1, $2, $3, $4, $5)`, [
                    'daily_summary',
                    summary.userEmail,
                    userId,
                    JSON.stringify({
                        subject: emailTemplate.subject,
                        date: targetDate,
                        activityCount: summary.chatCount + summary.documentCount + summary.emailGeneratedCount
                    }),
                    success
                ]);
                console.log(`✅ Daily summary email sent to ${summary.userEmail}`);
                return true;
            }
            catch (error) {
                console.error('Error sending daily summary email:', error);
                // Log failure to database
                await this.pool.query(`INSERT INTO email_notifications (notification_type, recipient_email, user_id, email_data, success, error_message)
           VALUES ($1, $2, $3, $4, $5, $6)`, [
                    'daily_summary',
                    summary.userEmail,
                    userId,
                    JSON.stringify({ subject: emailTemplate.subject, date: targetDate }),
                    false,
                    error.message
                ]);
                return false;
            }
        }
        catch (error) {
            console.error('Error in sendDailySummaryEmail:', error);
            return false;
        }
    }
    /**
     * Send email via the existing email service
     */
    async sendEmailViaService(to, subject, html, text) {
        try {
            const template = { subject, html, text };
            return await emailService.sendCustomEmail(to, template);
        }
        catch (error) {
            console.error('❌ Error in sendEmailViaService:', error);
            return false;
        }
    }
    /**
     * Send daily summaries to all active users
     */
    async sendAllDailySummaries(date) {
        const targetDate = date || new Date().toISOString().split('T')[0];
        console.log(`\n📊 Starting daily summary job for ${targetDate}...`);
        try {
            // Get all users who had activity today
            const result = await this.pool.query(`SELECT DISTINCT user_id, COUNT(*) as activity_count
         FROM user_activity_log
         WHERE DATE(created_at) = $1
         GROUP BY user_id
         HAVING COUNT(*) > 0`, [targetDate]);
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
                    }
                    else {
                        skipped++;
                    }
                }
                catch (error) {
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
        }
        catch (error) {
            console.error('Error in sendAllDailySummaries:', error);
            throw error;
        }
    }
    /**
     * Schedule daily summary job (to be called by cron or scheduler)
     */
    scheduleDailySummary(hour = 18, minute = 0) {
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
