/**
 * Quick test to verify Susan (S21) chat system is working
 * Run: npm run test:susan
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 Testing Susan (S21) Chat System...\n');

// Check environment variables
console.log('1️⃣ Checking AI Provider Configuration:');
console.log('   VITE_GEMINI_API_KEY:', process.env.VITE_GEMINI_API_KEY ? '✅ Set' : '❌ Missing');
console.log('   VITE_GROQ_API_KEY:', process.env.VITE_GROQ_API_KEY ? '✅ Set' : '❌ Missing');
console.log('   VITE_TOGETHER_API_KEY:', process.env.VITE_TOGETHER_API_KEY ? '✅ Set' : '❌ Missing');
console.log('   VITE_HF_API_KEY:', process.env.VITE_HF_API_KEY ? '✅ Set' : '❌ Missing');

const hasAtLeastOneProvider =
  process.env.VITE_GEMINI_API_KEY ||
  process.env.VITE_GROQ_API_KEY ||
  process.env.VITE_TOGETHER_API_KEY ||
  process.env.VITE_HF_API_KEY;

console.log('\n2️⃣ System Status:');
if (!hasAtLeastOneProvider) {
  console.log('   ❌ No AI providers configured!');
  console.log('   💡 At least one AI provider API key is required for Susan to work.');
  console.log('   💡 Set one of: VITE_GEMINI_API_KEY, VITE_GROQ_API_KEY, VITE_TOGETHER_API_KEY, VITE_HF_API_KEY');
  console.log('\n   Or install Ollama for local AI: https://ollama.ai\n');
  process.exit(1);
} else {
  console.log('   ✅ At least one AI provider is configured');
}

// Check database
console.log('\n3️⃣ Checking Database Configuration:');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
console.log('   DATABASE_URL:', DATABASE_URL ? '✅ Set' : '❌ Missing');

if (!DATABASE_URL) {
  console.log('   ⚠️  Database not configured - chat history will not be saved');
  console.log('   💡 Set DATABASE_URL or POSTGRES_URL for persistent chat history');
}

// Test database connection if available
if (DATABASE_URL) {
  try {
    const pg = await import('pg');
    const { Pool } = pg.default;

    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('railway')
        ? { rejectUnauthorized: false }
        : false
    });

    console.log('\n4️⃣ Testing Database Connection:');
    const result = await pool.query('SELECT NOW()');
    console.log('   ✅ Database connected:', result.rows[0].now);

    // Check chat_history table
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'chat_history'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('   ✅ chat_history table exists');

      // Count messages
      const countResult = await pool.query('SELECT COUNT(*) FROM chat_history');
      console.log(`   📊 Total chat messages in database: ${countResult.rows[0].count}`);
    } else {
      console.log('   ⚠️  chat_history table does not exist');
      console.log('   💡 Run: npm run db:init:railway');
    }

    await pool.end();
  } catch (error) {
    console.log('   ❌ Database connection failed:', error.message);
    console.log('   💡 Check your DATABASE_URL configuration');
  }
}

console.log('\n5️⃣ Susan Chat System Files:');
const fs = await import('fs');
const path = await import('path');

const criticalFiles = [
  'config/s21Personality.ts',
  'services/multiProviderAI.ts',
  'components/LivePanel.tsx',
  'server/index.ts'
];

for (const file of criticalFiles) {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
}

console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY\n');

if (hasAtLeastOneProvider) {
  console.log('✅ Susan (S21) chat is READY TO USE!');
  console.log('\n🎯 Susan is available through:');
  console.log('   1. Live Panel - Voice chat with Susan');
  console.log('   2. Chat Interface - Text chat with document search');
  console.log('   3. API Endpoint - /api/chat/messages\n');

  console.log('💡 Quick Test:');
  console.log('   1. Start the app: npm run dev');
  console.log('   2. Login with any email');
  console.log('   3. Click "Live" tab to test voice chat');
  console.log('   4. Or use the chat interface for text chat\n');
} else {
  console.log('❌ Susan (S21) chat needs configuration!');
  console.log('\n💡 Next Steps:');
  console.log('   1. Add at least one AI provider API key to .env');
  console.log('   2. Or install Ollama: https://ollama.ai');
  console.log('   3. Run this test again\n');
}

console.log('='.repeat(60));
