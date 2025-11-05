#!/usr/bin/env node
/**
 * Email Configuration Test Script
 * Tests and verifies email service configuration for S21 ROOFER project
 *
 * Usage: node test-email-config.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local manually
try {
  const envContent = readFileSync(join(__dirname, '.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    }
  });
} catch (error) {
  console.error('Error loading .env.local:', error.message);
}

console.log('\n' + '='.repeat(80));
console.log('EMAIL CONFIGURATION TEST');
console.log('='.repeat(80));

console.log('\n1. CHECKING ENVIRONMENT VARIABLES:');
console.log('-'.repeat(80));

const checks = [
  { name: 'RESEND_API_KEY', value: process.env.RESEND_API_KEY },
  { name: 'EMAIL_ADMIN_ADDRESS', value: process.env.EMAIL_ADMIN_ADDRESS },
  { name: 'EMAIL_FROM_ADDRESS', value: process.env.EMAIL_FROM_ADDRESS },
  { name: 'DATABASE_URL', value: process.env.DATABASE_URL || process.env.POSTGRES_URL }
];

let allSet = true;

checks.forEach(({ name, value }) => {
  const isSet = value && value !== 'your_resend_api_key_here';
  const status = isSet ? '✅ SET' : '❌ NOT SET';
  const displayValue = isSet ?
    (name.includes('KEY') || name.includes('URL') ?
      value.substring(0, 20) + '...' :
      value) :
    'NOT CONFIGURED';

  console.log(`   ${status} ${name}: ${displayValue}`);

  if (!isSet) {
    allSet = false;
  }
});

console.log('\n2. EMAIL PROVIDER DETECTION:');
console.log('-'.repeat(80));

let provider = 'console';
if (process.env.SENDGRID_API_KEY) {
  provider = 'sendgrid';
} else if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'your_resend_api_key_here') {
  provider = 'resend';
} else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  provider = 'nodemailer';
}

console.log(`   Provider: ${provider.toUpperCase()}`);

if (provider === 'console') {
  console.log('   ⚠️  WARNING: Email service is in CONSOLE MODE');
  console.log('   ⚠️  Emails will be logged to console but NOT actually sent');
} else {
  console.log(`   ✅ Email service configured for ${provider}`);
}

console.log('\n3. RESEND PACKAGE CHECK:');
console.log('-'.repeat(80));

try {
  const packageJson = await import('./package.json', { assert: { type: 'json' } });
  const resendVersion = packageJson.default.dependencies?.resend ||
                        packageJson.default.devDependencies?.resend;

  if (resendVersion) {
    console.log(`   ✅ Resend package installed (version: ${resendVersion})`);
  } else {
    console.log('   ❌ Resend package NOT found in package.json');
  }
} catch (error) {
  console.log('   ⚠️  Could not read package.json');
}

console.log('\n4. CONFIGURATION SUMMARY:');
console.log('-'.repeat(80));

if (allSet && provider !== 'console') {
  console.log('   ✅ Email configuration is COMPLETE and READY');
  console.log(`   ✅ Emails will be sent via ${provider.toUpperCase()}`);
  console.log(`   ✅ Admin email: ${process.env.EMAIL_ADMIN_ADDRESS}`);
  console.log(`   ✅ From email: ${process.env.EMAIL_FROM_ADDRESS}`);
} else {
  console.log('   ❌ Email configuration is INCOMPLETE');
  console.log('   ⚠️  Emails will be logged to console ONLY (not actually sent)');

  console.log('\n5. REQUIRED ACTIONS:');
  console.log('-'.repeat(80));

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your_resend_api_key_here') {
    console.log('   1. Get a Resend API key:');
    console.log('      - Visit https://resend.com/');
    console.log('      - Sign up for a free account');
    console.log('      - Go to API Keys section');
    console.log('      - Create a new API key');
    console.log('      - Copy the key (starts with "re_")');
  }

  if (!process.env.EMAIL_ADMIN_ADDRESS) {
    console.log('   2. Set EMAIL_ADMIN_ADDRESS in .env.local');
    console.log('      Example: EMAIL_ADMIN_ADDRESS=ahmed.mahmoud@theroofdocs.com');
  }

  if (!process.env.EMAIL_FROM_ADDRESS) {
    console.log('   3. Set EMAIL_FROM_ADDRESS in .env.local');
    console.log('      Example: EMAIL_FROM_ADDRESS=s21-assistant@roofer.com');
    console.log('      Note: Must be a verified domain in Resend');
  }

  console.log('\n   After updating .env.local:');
  console.log('   - Save the file');
  console.log('   - Restart the server');
  console.log('   - Run this test again: node test-email-config.js');
}

console.log('\n6. TESTING ENDPOINTS:');
console.log('-'.repeat(80));
console.log('   To test email sending:');
console.log('   1. Start the server: npm run dev');
console.log('   2. Test manual trigger:');
console.log('      curl -X POST http://localhost:3001/api/admin/trigger-cron-manual');
console.log('   3. Test daily summary:');
console.log('      curl -X POST http://localhost:3001/api/admin/trigger-daily-summary');
console.log('   4. Check cron status:');
console.log('      curl http://localhost:3001/api/admin/cron-status');

console.log('\n' + '='.repeat(80));
console.log('TEST COMPLETE');
console.log('='.repeat(80) + '\n');

process.exit(allSet && provider !== 'console' ? 0 : 1);
