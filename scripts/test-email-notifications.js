/**
 * Email Notification Test Script
 * Tests the email notification system without starting the full server
 *
 * Usage:
 *   node scripts/test-email-notifications.js
 *
 * This will test:
 * 1. Email service configuration
 * 2. Login notification template generation
 * 3. Chat notification template generation
 * 4. Email sending (will use console mode if no provider configured)
 */

console.log('🧪 Email Notification Test Script');
console.log('='.repeat(80));
console.log('');

// Simulate environment variables (you can modify these for testing)
process.env.EMAIL_ADMIN_ADDRESS = process.env.EMAIL_ADMIN_ADDRESS || 'ahmed.mahmoud@theroofdocs.com';
process.env.EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';

// Import email service (use dynamic import for ES modules)
import('../dist-server/services/emailService.js').then(async ({ emailService }) => {
  console.log('✅ Email service imported successfully');
  console.log('');

  // Get configuration
  const config = emailService.getConfig();
  console.log('📧 Email Service Configuration:');
  console.log('  Provider:', config.provider);
  console.log('  From:', config.from);
  console.log('  Admin Email:', config.adminEmail);
  console.log('  Configured:', config.provider !== 'console' ? 'Yes' : 'No (Console Mode)');
  console.log('');

  if (config.provider === 'console') {
    console.log('⚠️  No email provider configured. Emails will be logged to console.');
    console.log('   To configure a provider, set one of these environment variables:');
    console.log('   - SENDGRID_API_KEY');
    console.log('   - RESEND_API_KEY');
    console.log('   - SMTP_HOST, SMTP_USER, SMTP_PASS');
    console.log('');
  }

  // Test 1: Login Notification
  console.log('='.repeat(80));
  console.log('🧪 TEST 1: Login Notification');
  console.log('='.repeat(80));
  console.log('');

  const loginData = {
    userName: 'John Smith',
    userEmail: 'john.smith@roofer.com',
    timestamp: new Date(),
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
  };

  console.log('Sending login notification with data:');
  console.log('  User:', loginData.userName);
  console.log('  Email:', loginData.userEmail);
  console.log('  Time:', loginData.timestamp.toLocaleString());
  console.log('');

  const loginResult = await emailService.sendLoginNotification(loginData);
  console.log('Result:', loginResult ? '✅ Success' : '❌ Failed');
  console.log('');

  // Wait a bit before next test
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: Chat Notification
  console.log('='.repeat(80));
  console.log('🧪 TEST 2: Chat Interaction Notification');
  console.log('='.repeat(80));
  console.log('');

  const chatData = {
    userName: 'Jane Doe',
    userEmail: 'jane.doe@roofer.com',
    message: 'What are the installation requirements for GAF Timberline HDZ shingles in Maryland? I need to know about ice and water shield placement.',
    timestamp: new Date(),
    sessionId: 'session-test-12345',
    state: 'MD'
  };

  console.log('Sending chat notification with data:');
  console.log('  User:', chatData.userName);
  console.log('  Email:', chatData.userEmail);
  console.log('  State:', chatData.state);
  console.log('  Session:', chatData.sessionId);
  console.log('  Message:', chatData.message.substring(0, 80) + '...');
  console.log('');

  const chatResult = await emailService.sendChatNotification(chatData);
  console.log('Result:', chatResult ? '✅ Success' : '❌ Failed');
  console.log('');

  // Summary
  console.log('='.repeat(80));
  console.log('🎉 Test Complete!');
  console.log('='.repeat(80));
  console.log('');
  console.log('Summary:');
  console.log('  Login Notification:', loginResult ? '✅ Passed' : '❌ Failed');
  console.log('  Chat Notification:', chatResult ? '✅ Passed' : '❌ Failed');
  console.log('');

  if (config.provider === 'console') {
    console.log('💡 Tip: The emails above were logged to the console.');
    console.log('   In production, they will be sent to:', config.adminEmail);
    console.log('');
    console.log('📚 To configure a real email provider, see EMAIL_NOTIFICATIONS_README.md');
  } else {
    console.log('📧 Emails were sent via:', config.provider);
    console.log('   Check your inbox at:', config.adminEmail);
  }

  console.log('');
  process.exit(loginResult && chatResult ? 0 : 1);
}).catch(error => {
  console.error('❌ Error running test:', error);
  process.exit(1);
});
