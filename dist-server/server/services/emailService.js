/**
 * Email Notification Service
 * Supports multiple email providers: SendGrid, Resend, and Nodemailer (Gmail)
 * Provides email notifications for user logins and chat interactions
 */
class EmailService {
    static instance;
    config;
    provider = null;
    constructor() {
        // Initialize email configuration from environment variables
        this.config = {
            provider: this.detectProvider(),
            from: process.env.EMAIL_FROM_ADDRESS || 's21-assistant@roofer.com',
            adminEmail: process.env.EMAIL_ADMIN_ADDRESS || 'admin@roofer.com'
        };
        this.initializeProvider();
    }
    static getInstance() {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }
    /**
     * Detect which email provider to use based on environment variables
     */
    detectProvider() {
        console.log('🔍 Detecting email provider...');
        console.log('   SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? '✅ SET' : '❌ NOT SET');
        console.log('   RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ SET' : '❌ NOT SET');
        console.log('   SMTP_HOST:', process.env.SMTP_HOST ? '✅ SET' : '❌ NOT SET');
        if (process.env.SENDGRID_API_KEY) {
            console.log('✅ Email provider: SendGrid');
            return 'sendgrid';
        }
        else if (process.env.RESEND_API_KEY) {
            console.log('✅ Email provider: Resend');
            return 'resend';
        }
        else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            console.log('✅ Email provider: Nodemailer');
            return 'nodemailer';
        }
        else {
            console.warn('⚠️  No email provider configured. Emails will be logged to console.');
            console.warn('⚠️  To enable real email sending:');
            console.warn('     1. Add RESEND_API_KEY to .env.local');
            console.warn('     2. Get your API key from https://resend.com/');
            console.warn('     3. Add EMAIL_ADMIN_ADDRESS to .env.local');
            return 'console';
        }
    }
    /**
     * Initialize the selected email provider
     */
    async initializeProvider() {
        try {
            switch (this.config.provider) {
                case 'sendgrid':
                    // Dynamically import SendGrid (if installed)
                    try {
                        // @ts-expect-error - Optional dependency, may not be installed
                        const sgMail = await import('@sendgrid/mail');
                        if (sgMail) {
                            sgMail.default.setApiKey(process.env.SENDGRID_API_KEY);
                            this.provider = sgMail.default;
                            console.log('✅ Email service initialized with SendGrid');
                        }
                    }
                    catch {
                        console.warn('⚠️  @sendgrid/mail not installed. Install with: npm install @sendgrid/mail');
                        this.config.provider = 'console';
                    }
                    break;
                case 'resend':
                    // Dynamically import Resend (if installed)
                    try {
                        const resendModule = await import('resend');
                        const { Resend } = resendModule;
                        if (Resend) {
                            this.provider = new Resend(process.env.RESEND_API_KEY);
                            console.log('✅ Email service initialized with Resend');
                        }
                    }
                    catch {
                        console.warn('⚠️  resend not installed. Install with: npm install resend');
                        this.config.provider = 'console';
                    }
                    break;
                case 'nodemailer':
                    // Dynamically import Nodemailer (if installed)
                    try {
                        // @ts-expect-error - Optional dependency, may not be installed
                        const nodemailer = await import('nodemailer');
                        if (nodemailer) {
                            this.provider = nodemailer.default.createTransport({
                                host: process.env.SMTP_HOST,
                                port: parseInt(process.env.SMTP_PORT || '587'),
                                secure: process.env.SMTP_SECURE === 'true',
                                auth: {
                                    user: process.env.SMTP_USER,
                                    pass: process.env.SMTP_PASS,
                                },
                            });
                            console.log('✅ Email service initialized with Nodemailer');
                        }
                    }
                    catch {
                        console.warn('⚠️  nodemailer not installed. Install with: npm install nodemailer');
                        this.config.provider = 'console';
                    }
                    break;
                case 'console':
                    console.log('📧 Email service in console mode (development)');
                    break;
            }
        }
        catch (error) {
            console.error('❌ Error initializing email provider:', error);
            this.config.provider = 'console';
        }
    }
    /**
     * Generate login notification email template
     */
    generateLoginNotificationTemplate(data) {
        const { userName, userEmail, timestamp, ipAddress, userAgent } = data;
        const formattedTime = timestamp.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });
        const subject = `🔐 New User Login - ${userName}`;
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login Notification</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #ef4444; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .info-row { margin: 10px 0; }
          .label { font-weight: 600; color: #555; display: inline-block; width: 120px; }
          .value { color: #333; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #e0e0e0; }
          .icon { font-size: 40px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="icon">🔐</div>
            <h1>User Login Notification</h1>
          </div>
          <div class="content">
            <p>A user has successfully logged into the S21 Field AI Assistant.</p>

            <div class="info-box">
              <div class="info-row">
                <span class="label">User Name:</span>
                <span class="value">${userName}</span>
              </div>
              <div class="info-row">
                <span class="label">Email:</span>
                <span class="value">${userEmail}</span>
              </div>
              <div class="info-row">
                <span class="label">Login Time:</span>
                <span class="value">${formattedTime}</span>
              </div>
              ${ipAddress ? `
              <div class="info-row">
                <span class="label">IP Address:</span>
                <span class="value">${ipAddress}</span>
              </div>
              ` : ''}
              ${userAgent ? `
              <div class="info-row">
                <span class="label">User Agent:</span>
                <span class="value" style="word-break: break-all;">${userAgent}</span>
              </div>
              ` : ''}
            </div>

            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              This is an automated notification from the S21 Field AI Assistant system.
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
🔐 USER LOGIN NOTIFICATION

User Name: ${userName}
Email: ${userEmail}
Login Time: ${formattedTime}
${ipAddress ? `IP Address: ${ipAddress}` : ''}
${userAgent ? `User Agent: ${userAgent}` : ''}

This is an automated notification from the S21 Field AI Assistant system.

---
S21 Field AI Assistant
Powered by ROOFER - The Roof Docs
    `.trim();
        return { subject, html, text };
    }
    /**
     * Generate chat interaction notification email template
     */
    generateChatNotificationTemplate(data) {
        const { userName, userEmail, message, timestamp, sessionId, state } = data;
        const formattedTime = timestamp.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });
        // Truncate message if too long
        const truncatedMessage = message.length > 500 ? message.substring(0, 500) + '...' : message;
        const subject = `💬 Chat Interaction - ${userName}`;
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat Notification</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .info-row { margin: 10px 0; }
          .label { font-weight: 600; color: #555; display: inline-block; width: 120px; }
          .value { color: #333; }
          .message-box { background: #e3f2fd; border: 1px solid #90caf9; padding: 15px; margin: 15px 0; border-radius: 4px; white-space: pre-wrap; word-break: break-word; font-family: 'Courier New', monospace; font-size: 13px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #e0e0e0; }
          .icon { font-size: 40px; margin-bottom: 10px; }
          .state-badge { display: inline-block; padding: 4px 12px; background: #ef4444; color: white; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="icon">💬</div>
            <h1>Chat Interaction Notification</h1>
          </div>
          <div class="content">
            <p>A user has sent a message in the S21 Field AI Assistant chat.</p>

            <div class="info-box">
              <div class="info-row">
                <span class="label">User Name:</span>
                <span class="value">${userName}</span>
              </div>
              <div class="info-row">
                <span class="label">Email:</span>
                <span class="value">${userEmail}</span>
              </div>
              <div class="info-row">
                <span class="label">Timestamp:</span>
                <span class="value">${formattedTime}</span>
              </div>
              ${state ? `
              <div class="info-row">
                <span class="label">State Context:</span>
                <span class="value">${state}<span class="state-badge">${state}</span></span>
              </div>
              ` : ''}
              ${sessionId ? `
              <div class="info-row">
                <span class="label">Session ID:</span>
                <span class="value">${sessionId}</span>
              </div>
              ` : ''}
            </div>

            <h3 style="margin-top: 25px; margin-bottom: 10px; color: #333;">Message Content:</h3>
            <div class="message-box">${truncatedMessage}</div>
            ${message.length > 500 ? '<p style="font-size: 12px; color: #666; font-style: italic;">(Message truncated for email)</p>' : ''}

            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              This is an automated notification from the S21 Field AI Assistant system.
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
💬 CHAT INTERACTION NOTIFICATION

User Name: ${userName}
Email: ${userEmail}
Timestamp: ${formattedTime}
${state ? `State Context: ${state}` : ''}
${sessionId ? `Session ID: ${sessionId}` : ''}

MESSAGE CONTENT:
${truncatedMessage}
${message.length > 500 ? '\n(Message truncated for email)' : ''}

This is an automated notification from the S21 Field AI Assistant system.

---
S21 Field AI Assistant
Powered by ROOFER - The Roof Docs
    `.trim();
        return { subject, html, text };
    }
    /**
     * Send email using the configured provider
     */
    async sendEmail(to, template) {
        try {
            switch (this.config.provider) {
                case 'sendgrid':
                    await this.provider.send({
                        to,
                        from: this.config.from,
                        subject: template.subject,
                        text: template.text,
                        html: template.html,
                    });
                    console.log(`✅ Email sent via SendGrid to ${to}`);
                    return true;
                case 'resend':
                    console.log(`📤 Sending email via Resend API...`);
                    console.log(`   From: ${this.config.from}`);
                    console.log(`   To: ${to}`);
                    console.log(`   Subject: ${template.subject}`);
                    const resendResult = await this.provider.emails.send({
                        from: this.config.from,
                        to: [to],
                        subject: template.subject,
                        html: template.html,
                        text: template.text,
                    });
                    console.log(`✅ Email sent via Resend successfully!`);
                    console.log(`   Resend Response:`, JSON.stringify(resendResult, null, 2));
                    return true;
                case 'nodemailer':
                    await this.provider.sendMail({
                        from: this.config.from,
                        to,
                        subject: template.subject,
                        text: template.text,
                        html: template.html,
                    });
                    console.log(`✅ Email sent via Nodemailer to ${to}`);
                    return true;
                case 'console':
                    console.log('\n' + '='.repeat(80));
                    console.log('📧 EMAIL NOTIFICATION (CONSOLE MODE - DEV ONLY)');
                    console.log('='.repeat(80));
                    console.log(`To: ${to}`);
                    console.log(`From: ${this.config.from}`);
                    console.log(`Subject: ${template.subject}`);
                    console.log('-'.repeat(80));
                    console.log('TEXT CONTENT:');
                    console.log('-'.repeat(80));
                    console.log(template.text);
                    console.log('='.repeat(80) + '\n');
                    return true;
                default:
                    console.error('❌ Unknown email provider:', this.config.provider);
                    return false;
            }
        }
        catch (error) {
            console.error('❌ Error sending email:', error);
            // Fallback to console logging
            console.log('\n' + '='.repeat(80));
            console.log('📧 EMAIL NOTIFICATION (FALLBACK TO CONSOLE - ERROR OCCURRED)');
            console.log('='.repeat(80));
            console.log(`Error: ${error.message}`);
            console.log(`To: ${to}`);
            console.log(`Subject: ${template.subject}`);
            console.log('-'.repeat(80));
            console.log(template.text);
            console.log('='.repeat(80) + '\n');
            return false;
        }
    }
    /**
     * Send login notification to admin
     */
    async sendLoginNotification(data) {
        try {
            const template = this.generateLoginNotificationTemplate(data);
            return await this.sendEmail(this.config.adminEmail, template);
        }
        catch (error) {
            console.error('Error sending login notification:', error);
            return false;
        }
    }
    /**
     * Send chat interaction notification to admin
     */
    async sendChatNotification(data) {
        try {
            const template = this.generateChatNotificationTemplate(data);
            return await this.sendEmail(this.config.adminEmail, template);
        }
        catch (error) {
            console.error('Error sending chat notification:', error);
            return false;
        }
    }
    /**
     * Send custom email with provided template
     * PUBLIC API for services that need to send custom emails
     */
    async sendCustomEmail(to, template) {
        try {
            return await this.sendEmail(to, template);
        }
        catch (error) {
            console.error('Error sending custom email:', error);
            return false;
        }
    }
    /**
     * Generate verification code email template
     */
    generateVerificationCodeTemplate(data) {
        const { email, code, expiresInMinutes = 10 } = data;
        const subject = `🔐 Your Susan AI-21 Verification Code: ${code}`;
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Code</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; text-align: center; }
          .code-box { background: #f8f9fa; border: 2px dashed #ef4444; padding: 20px; margin: 25px 0; border-radius: 8px; }
          .code { font-size: 36px; font-weight: bold; color: #ef4444; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .expires { color: #666; font-size: 14px; margin-top: 15px; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #856404; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #e0e0e0; }
          .icon { font-size: 40px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="icon">🔐</div>
            <h1>Verification Code</h1>
          </div>
          <div class="content">
            <p>You're signing in to Susan AI-21 with:</p>
            <p><strong>${email}</strong></p>

            <div class="code-box">
              <div class="code">${code}</div>
              <div class="expires">This code expires in ${expiresInMinutes} minutes</div>
            </div>

            <p>Enter this code in the app to complete your sign-in.</p>

            <div class="warning">
              ⚠️ If you didn't request this code, please ignore this email. Someone may have entered your email address by mistake.
            </div>
          </div>
          <div class="footer">
            <p style="margin: 5px 0;">Susan AI-21 Field Assistant</p>
            <p style="margin: 5px 0; font-size: 12px;">Powered by ROOFER - The Roof Docs</p>
          </div>
        </div>
      </body>
      </html>
    `;
        const text = `
🔐 VERIFICATION CODE

You're signing in to Susan AI-21 with: ${email}

Your verification code is: ${code}

This code expires in ${expiresInMinutes} minutes.

Enter this code in the app to complete your sign-in.

⚠️ If you didn't request this code, please ignore this email.

---
Susan AI-21 Field Assistant
Powered by ROOFER - The Roof Docs
    `.trim();
        return { subject, html, text };
    }
    /**
     * Send verification code to user
     * Returns true if email was sent successfully
     */
    async sendVerificationCode(data) {
        try {
            const template = this.generateVerificationCodeTemplate(data);
            return await this.sendEmail(data.email, template);
        }
        catch (error) {
            console.error('Error sending verification code email:', error);
            return false;
        }
    }
    /**
     * Get current email configuration (for debugging)
     */
    getConfig() {
        return { ...this.config };
    }
}
// Export singleton instance
export const emailService = EmailService.getInstance();
