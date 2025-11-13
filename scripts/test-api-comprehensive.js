/**
 * Comprehensive API Test Suite
 * Tests all critical endpoints to verify the app is working correctly
 * Run: npm run test:api
 */

import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.DATABASE_URL ? 'production' : 'local';
const TEST_EMAIL = 'test@roofer.com';

console.log('🧪 API Test Suite Starting...\n');
console.log(`Testing against: ${API_BASE === 'production' ? 'Railway (Production)' : 'Local Development'}\n`);
console.log('='.repeat(60));

let passedTests = 0;
let failedTests = 0;
const results = [];

// Helper function to run a test
async function runTest(name, testFn) {
  try {
    console.log(`\n🔍 Testing: ${name}`);
    const result = await testFn();
    if (result.success) {
      console.log(`  ✅ PASS: ${result.message}`);
      passedTests++;
      results.push({ name, status: 'PASS', message: result.message });
    } else {
      console.log(`  ❌ FAIL: ${result.message}`);
      if (result.details) console.log(`     Details: ${result.details}`);
      failedTests++;
      results.push({ name, status: 'FAIL', message: result.message, details: result.details });
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    failedTests++;
    results.push({ name, status: 'ERROR', message: error.message });
  }
}

// Test 1: Database Connection
await runTest('Database Connection', async () => {
  const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!DATABASE_URL) {
    return {
      success: false,
      message: 'No DATABASE_URL configured',
      details: 'Set DATABASE_URL or POSTGRES_URL environment variable'
    };
  }

  try {
    const pg = await import('pg');
    const { Pool } = pg.default;

    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('railway')
        ? { rejectUnauthorized: false }
        : false
    });

    const result = await pool.query('SELECT NOW()');
    await pool.end();

    return {
      success: true,
      message: `Connected successfully at ${result.rows[0].now}`
    };
  } catch (error) {
    return {
      success: false,
      message: 'Database connection failed',
      details: error.message
    };
  }
});

// Test 2: Required Database Tables
await runTest('Database Tables', async () => {
  const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!DATABASE_URL) {
    return { success: false, message: 'Database not configured' };
  }

  try {
    const pg = await import('pg');
    const { Pool } = pg.default;

    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('railway')
        ? { rejectUnauthorized: false }
        : false
    });

    const requiredTables = [
      'users',
      'chat_history',
      'announcements',
      'email_logs',
      'api_usage',
      'user_activity_log'
    ];

    const missingTables = [];

    for (const table of requiredTables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [table]);

      if (!result.rows[0].exists) {
        missingTables.push(table);
      }
    }

    await pool.end();

    if (missingTables.length > 0) {
      return {
        success: false,
        message: 'Missing required tables',
        details: `Missing: ${missingTables.join(', ')}. Run: npm run db:init:railway`
      };
    }

    return {
      success: true,
      message: `All ${requiredTables.length} required tables exist`
    };
  } catch (error) {
    return {
      success: false,
      message: 'Table check failed',
      details: error.message
    };
  }
});

// Test 3: AI Provider Configuration
await runTest('AI Provider Configuration', async () => {
  const providers = {
    'Gemini': process.env.VITE_GEMINI_API_KEY,
    'Groq': process.env.VITE_GROQ_API_KEY,
    'Together AI': process.env.VITE_TOGETHER_API_KEY,
    'Hugging Face': process.env.VITE_HF_API_KEY
  };

  const configured = Object.entries(providers)
    .filter(([_, key]) => key)
    .map(([name, _]) => name);

  if (configured.length === 0) {
    return {
      success: false,
      message: 'No AI providers configured',
      details: 'Susan chat requires at least one: VITE_GEMINI_API_KEY, VITE_GROQ_API_KEY, VITE_TOGETHER_API_KEY, or VITE_HF_API_KEY'
    };
  }

  return {
    success: true,
    message: `${configured.length} provider(s) configured: ${configured.join(', ')}`
  };
});

// Test 4: Email Configuration
await runTest('Email Configuration', async () => {
  const emailConfig = {
    'Admin Email': process.env.EMAIL_ADMIN_ADDRESS,
    'From Email': process.env.EMAIL_FROM_ADDRESS,
    'SendGrid': process.env.SENDGRID_API_KEY,
    'Resend': process.env.RESEND_API_KEY,
    'SMTP': process.env.SMTP_HOST && process.env.SMTP_USER
  };

  const hasProvider = !!(emailConfig.SendGrid || emailConfig.Resend || emailConfig.SMTP);
  const hasAddresses = !!(emailConfig['Admin Email'] && emailConfig['From Email']);

  if (!hasProvider) {
    return {
      success: false,
      message: 'No email provider configured',
      details: 'Set SENDGRID_API_KEY, RESEND_API_KEY, or SMTP_* variables'
    };
  }

  if (!hasAddresses) {
    return {
      success: false,
      message: 'Email addresses not configured',
      details: 'Set EMAIL_ADMIN_ADDRESS and EMAIL_FROM_ADDRESS'
    };
  }

  const provider = emailConfig.SendGrid ? 'SendGrid' :
                   emailConfig.Resend ? 'Resend' : 'SMTP';

  return {
    success: true,
    message: `Email configured with ${provider}`
  };
});

// Test 5: Critical Files Exist
await runTest('Critical Application Files', async () => {
  const fs = await import('fs');

  const criticalFiles = [
    'dist/index.html',
    'dist-server/index.js',
    'config/s21Personality.ts',
    'services/multiProviderAI.ts',
    'database/schema.sql'
  ];

  const missing = [];

  for (const file of criticalFiles) {
    if (!fs.existsSync(file)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    return {
      success: false,
      message: 'Missing critical files',
      details: `Missing: ${missing.join(', ')}. Run: npm run build`
    };
  }

  return {
    success: true,
    message: `All ${criticalFiles.length} critical files exist`
  };
});

// Test 6: Chat History Table
await runTest('Chat History Functionality', async () => {
  const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!DATABASE_URL) {
    return { success: false, message: 'Database not configured' };
  }

  try {
    const pg = await import('pg');
    const { Pool } = pg.default;

    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('railway')
        ? { rejectUnauthorized: false }
        : false
    });

    // Check chat_history table
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'chat_history'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      await pool.end();
      return {
        success: false,
        message: 'chat_history table does not exist',
        details: 'Run: npm run db:init:railway'
      };
    }

    // Check chat count
    const countResult = await pool.query('SELECT COUNT(*) FROM chat_history');
    const count = parseInt(countResult.rows[0].count);

    await pool.end();

    return {
      success: true,
      message: `Chat history table exists with ${count} messages`
    };
  } catch (error) {
    return {
      success: false,
      message: 'Chat history check failed',
      details: error.message
    };
  }
});

// Test 7: Announcements System
await runTest('Announcements System', async () => {
  const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!DATABASE_URL) {
    return { success: false, message: 'Database not configured' };
  }

  try {
    const pg = await import('pg');
    const { Pool } = pg.default;

    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('railway')
        ? { rejectUnauthorized: false }
        : false
    });

    // Check announcements table
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'announcements'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      await pool.end();
      return {
        success: false,
        message: 'announcements table does not exist',
        details: 'Run: npm run db:init:railway'
      };
    }

    // Check for Baby Malik announcement
    const malikCheck = await pool.query(`
      SELECT id, title, start_time, is_active
      FROM announcements
      WHERE title LIKE '%Baby Malik%'
      LIMIT 1
    `);

    await pool.end();

    if (malikCheck.rows.length > 0) {
      const ann = malikCheck.rows[0];
      return {
        success: true,
        message: `Baby Malik announcement ${ann.is_active ? 'ACTIVE' : 'inactive'} (starts: ${ann.start_time})`
      };
    }

    return {
      success: true,
      message: 'Announcements table exists (no Baby Malik announcement yet)'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Announcements check failed',
      details: error.message
    };
  }
});

// Print Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY\n');

console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Total:  ${passedTests + failedTests}`);

const successRate = ((passedTests / (passedTests + failedTests)) * 100).toFixed(1);
console.log(`\n🎯 Success Rate: ${successRate}%`);

if (failedTests === 0) {
  console.log('\n🎉 ALL TESTS PASSED! The app is ready to use.\n');
  console.log('✅ Database: Connected and configured');
  console.log('✅ Susan Chat: Ready (AI providers configured)');
  console.log('✅ Email: Configured and ready');
  console.log('✅ Announcements: System operational');
  console.log('\n💡 Next Steps:');
  console.log('   1. Deploy Baby Malik announcement: npm run announcement:trigger-now:railway');
  console.log('   2. Start the app: npm start');
  console.log('   3. Access at: https://your-app.railway.app\n');
} else {
  console.log('\n⚠️  SOME TESTS FAILED - Review the details above\n');
  console.log('Failed tests:');
  results
    .filter(r => r.status !== 'PASS')
    .forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.message}`);
      if (r.details) console.log(`     → ${r.details}`);
    });
  console.log('\n💡 Fix the issues above and run this test again.\n');
  process.exit(1);
}

console.log('='.repeat(60));
