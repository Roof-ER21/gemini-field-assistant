/**
 * Comprehensive Admin Panel & Email Test
 * Tests all admin functionality and sends email report to Ahmed
 */

import { Resend } from 'resend';

// Load environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_6GVYbR5u_Cky9agmkxFdBBcqhEa15egME';
const ADMIN_EMAIL = process.env.EMAIL_ADMIN_ADDRESS || 'ahmed.mahmoud@theroofdocs.com';
const APP_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://sa21.up.railway.app';

const resend = new Resend(RESEND_API_KEY);

console.log('🧪 Starting Admin Panel & Email Test Suite...\n');
console.log(`📧 Admin Email: ${ADMIN_EMAIL}`);
console.log(`🌐 App URL: ${APP_URL}\n`);

const testResults = {
  timestamp: new Date().toISOString(),
  appUrl: APP_URL,
  tests: [],
  passed: 0,
  failed: 0,
  errors: []
};

// Helper to add test result
function addTest(name, passed, details = '') {
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
  }
}

// Test 1: Check if admin users endpoint works
async function testAdminUsersEndpoint() {
  try {
    const response = await fetch(`${APP_URL}/api/admin/users`);
    const data = await response.json();

    if (response.ok && Array.isArray(data)) {
      addTest('Admin Users Endpoint', true, `Found ${data.length} users`);

      // Check if Ahmed is in the list
      const ahmed = data.find(u => u.email === ADMIN_EMAIL);
      if (ahmed) {
        addTest('Ahmed in User List', true, `Role: ${ahmed.role}`);
        if (ahmed.role === 'admin') {
          addTest('Ahmed Has Admin Role', true);
        } else {
          addTest('Ahmed Has Admin Role', false, `Current role: ${ahmed.role}`);
        }
      } else {
        addTest('Ahmed in User List', false, 'Not found');
      }

      return data;
    } else {
      addTest('Admin Users Endpoint', false, data.error || 'Invalid response');
      return null;
    }
  } catch (error) {
    addTest('Admin Users Endpoint', false, error.message);
    testResults.errors.push(`Admin Users Endpoint: ${error.message}`);
    return null;
  }
}

// Test 2: Check if fix-admin-role page exists
async function testFixAdminRolePage() {
  try {
    const response = await fetch(`${APP_URL}/fix-admin-role.html`);
    if (response.ok) {
      addTest('Fix Admin Role Page', true, 'Emergency fix page accessible');
    } else {
      addTest('Fix Admin Role Page', false, `Status: ${response.status}`);
    }
  } catch (error) {
    addTest('Fix Admin Role Page', false, error.message);
  }
}

// Test 3: Check if check-auth page exists
async function testCheckAuthPage() {
  try {
    const response = await fetch(`${APP_URL}/check-auth.html`);
    if (response.ok) {
      addTest('Check Auth Debug Page', true, 'Debug page accessible');
    } else {
      addTest('Check Auth Debug Page', false, `Status: ${response.status}`);
    }
  } catch (error) {
    addTest('Check Auth Debug Page', false, error.message);
  }
}

// Test 4: Check if new user lookup endpoint exists
async function testUserLookupEndpoint() {
  try {
    const response = await fetch(`${APP_URL}/api/users/${encodeURIComponent(ADMIN_EMAIL)}`);

    if (response.status === 404) {
      addTest('User Lookup Endpoint', false, 'Endpoint not deployed yet (404)');
    } else if (response.ok) {
      const data = await response.json();
      addTest('User Lookup Endpoint', true, `Found user: ${data.email}`);
    } else {
      const error = await response.text();
      addTest('User Lookup Endpoint', false, `Status ${response.status}: ${error}`);
    }
  } catch (error) {
    addTest('User Lookup Endpoint', false, error.message);
  }
}

// Send email report
async function sendEmailReport() {
  const passRate = testResults.tests.length > 0
    ? Math.round((testResults.passed / testResults.tests.length) * 100)
    : 0;

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 10px 0 0 0; opacity: 0.9; }
    .summary { background: #f9fafb; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 15px; }
    .summary-item { text-align: center; }
    .summary-item .number { font-size: 36px; font-weight: bold; margin-bottom: 5px; }
    .summary-item .label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .passed { color: #10b981; }
    .failed { color: #ef4444; }
    .test-results { margin: 30px 0; }
    .test-item { padding: 15px; margin: 10px 0; border-radius: 6px; border: 1px solid #e5e7eb; }
    .test-item.pass { background: #f0fdf4; border-color: #86efac; }
    .test-item.fail { background: #fef2f2; border-color: #fca5a5; }
    .test-name { font-weight: bold; margin-bottom: 5px; }
    .test-details { font-size: 14px; color: #6b7280; }
    .action-box { background: #eff6ff; border: 1px solid #93c5fd; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .action-box h3 { margin-top: 0; color: #1e40af; }
    .action-box ol { margin: 10px 0; padding-left: 20px; }
    .action-box li { margin: 8px 0; }
    .button { display: inline-block; padding: 12px 24px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 10px 10px 0; }
    .button:hover { background: #dc2626; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
    .code { background: #1f2937; color: #10b981; padding: 15px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; margin: 10px 0; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ S21 ROOFER Admin Panel Test Report</h1>
    <p>Comprehensive functionality test and setup verification</p>
    <p>${new Date(testResults.timestamp).toLocaleString()}</p>
  </div>

  <div class="summary">
    <h2 style="margin-top: 0;">📊 Test Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="number">${testResults.tests.length}</div>
        <div class="label">Total Tests</div>
      </div>
      <div class="summary-item">
        <div class="number passed">${testResults.passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="summary-item">
        <div class="number failed">${testResults.failed}</div>
        <div class="label">Failed</div>
      </div>
    </div>
    <p style="margin-top: 20px; font-size: 18px; text-align: center;">
      <strong>Pass Rate: ${passRate}%</strong>
    </p>
  </div>

  ${testResults.failed > 0 ? `
  <div class="action-box">
    <h3>🚨 Action Required: Admin Panel Not Visible</h3>
    <p><strong>Problem:</strong> Your localStorage session was created with the old code that hardcoded your role as "sales_rep".</p>
    <p><strong>Quick Fix:</strong> Use the emergency fix page to instantly update your role to admin.</p>

    <a href="${APP_URL}/fix-admin-role.html" class="button">🛠️ FIX ADMIN ROLE NOW</a>

    <h4>Step-by-Step Instructions:</h4>
    <ol>
      <li>Click the "FIX ADMIN ROLE NOW" button above</li>
      <li>On the fix page, click "FIX MY ADMIN ROLE NOW"</li>
      <li>You'll see a success message</li>
      <li>Click "Go to App"</li>
      <li>Look in the sidebar for "Admin Panel" with a shield icon 🛡️</li>
      <li>Click it to access all user conversations!</li>
    </ol>

    <h4>Alternative: Manual Fix (Advanced)</h4>
    <p>If the button above doesn't work, manually fix it:</p>
    <ol>
      <li>Go to <a href="${APP_URL}">${APP_URL}</a></li>
      <li>Open browser DevTools (F12)</li>
      <li>Go to Console tab</li>
      <li>Paste this code and press Enter:</li>
    </ol>
    <div class="code">const token = JSON.parse(localStorage.getItem('s21_auth_token'));
token.user.role = 'admin';
localStorage.setItem('s21_auth_token', JSON.stringify(token));
const authUser = JSON.parse(localStorage.getItem('s21_auth_user'));
authUser.role = 'admin';
localStorage.setItem('s21_auth_user', JSON.stringify(authUser));
console.log('✅ Role updated to admin!');
location.reload();</div>
    <p>The page will reload and the Admin Panel will appear in the sidebar!</p>
  </div>
  ` : `
  <div style="background: #f0fdf4; border: 1px solid #86efac; padding: 20px; border-radius: 6px; margin: 20px 0;">
    <h3 style="color: #10b981; margin-top: 0;">✅ All Tests Passed!</h3>
    <p>The Admin Panel should be fully functional. Access it here:</p>
    <a href="${APP_URL}" class="button">🛡️ GO TO ADMIN PANEL</a>
  </div>
  `}

  <div class="test-results">
    <h2>📋 Detailed Test Results</h2>
    ${testResults.tests.map(test => `
      <div class="test-item ${test.passed ? 'pass' : 'fail'}">
        <div class="test-name">${test.passed ? '✅' : '❌'} ${test.name}</div>
        ${test.details ? `<div class="test-details">${test.details}</div>` : ''}
      </div>
    `).join('')}
  </div>

  ${testResults.errors.length > 0 ? `
  <div style="background: #fef2f2; border: 1px solid #fca5a5; padding: 20px; border-radius: 6px; margin: 20px 0;">
    <h3 style="color: #ef4444; margin-top: 0;">❌ Errors Encountered</h3>
    <ul>
      ${testResults.errors.map(err => `<li>${err}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="action-box">
    <h3>📚 Useful Links</h3>
    <a href="${APP_URL}" class="button">🏠 Main App</a>
    <a href="${APP_URL}/fix-admin-role.html" class="button">🛠️ Fix Admin Role</a>
    <a href="${APP_URL}/check-auth.html" class="button">🔍 Check Auth Status</a>
  </div>

  <div class="footer">
    <p><strong>S21 ROOFER Field AI Assistant</strong></p>
    <p>Tested at: ${testResults.appUrl}</p>
    <p>Generated by automated test suite on ${new Date(testResults.timestamp).toLocaleString()}</p>
    <p>🤖 This email was automatically generated to verify admin panel functionality.</p>
  </div>
</body>
</html>
  `;

  try {
    console.log('\n📧 Sending email report to:', ADMIN_EMAIL);

    const { data, error } = await resend.emails.send({
      from: 'S21 ROOFER <onboarding@resend.dev>',
      to: [ADMIN_EMAIL],
      subject: `🛡️ Admin Panel Test Report - ${testResults.passed}/${testResults.tests.length} Tests Passed`,
      html: emailHtml
    });

    if (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }

    console.log('✅ Email sent successfully!');
    console.log('   Email ID:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('Starting test execution...\n');

  await testAdminUsersEndpoint();
  await testUserLookupEndpoint();
  await testFixAdminRolePage();
  await testCheckAuthPage();

  console.log('\n' + '='.repeat(60));
  console.log(`📊 SUMMARY: ${testResults.passed}/${testResults.tests.length} tests passed`);
  console.log('='.repeat(60) + '\n');

  const emailSent = await sendEmailReport();

  if (emailSent) {
    console.log('\n✅ Complete! Check your email at:', ADMIN_EMAIL);
  } else {
    console.log('\n❌ Email sending failed. Check the logs above.');
  }

  process.exit(testResults.failed > 0 ? 1 : 0);
}

runTests();
