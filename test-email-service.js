/**
 * Email Service Test Script
 *
 * Tests the email service configuration and sends a test verification code email.
 *
 * Usage:
 *   node test-email-service.js [email]
 *
 * Example:
 *   node test-email-service.js careers@theroofdocs.com
 */

import { emailService } from './server/services/emailService.ts';

const testEmail = process.argv[2] || 'test@example.com';

console.log('\n' + '='.repeat(80));
console.log('📧 EMAIL SERVICE TEST');
console.log('='.repeat(80));
console.log(`Testing email to: ${testEmail}`);
console.log('Time:', new Date().toISOString());
console.log('='.repeat(80) + '\n');

// Check configuration
console.log('📋 Email Service Configuration:');
const config = emailService.getConfig();
console.log('   Provider:', config.provider);
console.log('   From:', config.from);
console.log('   Admin:', config.adminEmail);
console.log('');

// Test verification code email
const testCode = Math.floor(100000 + Math.random() * 900000).toString();

console.log('🔐 Sending test verification code...');
console.log(`   Code: ${testCode}`);
console.log('');

emailService.sendVerificationCode({
  email: testEmail,
  code: testCode,
  expiresInMinutes: 10
})
  .then(success => {
    console.log('');
    console.log('='.repeat(80));
    if (success) {
      console.log('✅ TEST PASSED: Email sent successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('   1. Check email inbox for:', testEmail);
      console.log('   2. Verify code matches:', testCode);
      console.log('   3. Check email formatting and styling');
    } else {
      console.log('❌ TEST FAILED: Email was not sent');
      console.log('');
      console.log('Troubleshooting:');
      console.log('   1. Check if RESEND_API_KEY is set in .env.local');
      console.log('   2. Restart the server after adding API key');
      console.log('   3. Check server logs for specific error messages');
      console.log('   4. Verify API key is valid in Resend dashboard');
    }
    console.log('='.repeat(80) + '\n');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.log('');
    console.log('='.repeat(80));
    console.log('❌ TEST ERROR:', error.message);
    console.log('='.repeat(80) + '\n');
    console.error(error);
    process.exit(1);
  });
