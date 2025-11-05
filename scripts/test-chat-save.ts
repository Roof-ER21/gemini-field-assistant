/**
 * Database Chat Save Diagnostic Script
 * Tests the complete chat message save flow
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testChatSave() {
  console.log('🔍 Starting Chat Save Diagnostic...\n');

  try {
    // 1. Test database connection
    console.log('1️⃣ Testing database connection...');
    const connResult = await pool.query('SELECT NOW() as time, current_database() as db');
    console.log('✅ Connected to database:', connResult.rows[0].db);
    console.log('   Server time:', connResult.rows[0].time);
    console.log('');

    // 2. Check if chat_history table exists
    console.log('2️⃣ Checking if chat_history table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'chat_history'
      ) as exists
    `);

    if (tableCheck.rows[0].exists) {
      console.log('✅ chat_history table exists');
    } else {
      console.error('❌ chat_history table does NOT exist!');
      console.log('   Run: npm run migrate:db to create the table');
      return;
    }
    console.log('');

    // 3. Get table structure
    console.log('3️⃣ Checking chat_history table structure...');
    const structureResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'chat_history'
      ORDER BY ordinal_position
    `);
    console.log('✅ Table columns:');
    structureResult.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? '* REQUIRED' : ''}`);
    });
    console.log('');

    // 4. Check if test user exists
    console.log('4️⃣ Checking for test users...');
    const userResult = await pool.query(`
      SELECT id, email, name, role FROM users LIMIT 5
    `);
    console.log(`✅ Found ${userResult.rows.length} users:`);
    userResult.rows.forEach(user => {
      console.log(`   - ${user.email} (${user.role}) - ID: ${user.id}`);
    });
    console.log('');

    // 5. Get or create test user
    console.log('5️⃣ Getting/creating test user...');
    const testEmail = 'test@roofer.com';
    let userId: string;

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [testEmail]
    );

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      console.log('✅ Test user exists:', userId);
    } else {
      const newUser = await pool.query(
        `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
        [testEmail, 'Test User', 'sales_rep']
      );
      userId = newUser.rows[0].id;
      console.log('✅ Created test user:', userId);
    }
    console.log('');

    // 6. Test message insertion
    console.log('6️⃣ Testing message insertion...');
    const testMessage = {
      user_id: userId,
      message_id: `test-${Date.now()}`,
      sender: 'user',
      content: 'This is a diagnostic test message',
      state: 'VA',
      provider: 'Test',
      sources: JSON.stringify([{ name: 'test.pdf', path: '/test.pdf' }]),
      session_id: `test-session-${Date.now()}`
    };

    console.log('   Inserting message:', {
      message_id: testMessage.message_id,
      sender: testMessage.sender,
      session_id: testMessage.session_id
    });

    const insertResult = await pool.query(
      `INSERT INTO chat_history
       (user_id, message_id, sender, content, state, provider, sources, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        testMessage.user_id,
        testMessage.message_id,
        testMessage.sender,
        testMessage.content,
        testMessage.state,
        testMessage.provider,
        testMessage.sources,
        testMessage.session_id
      ]
    );

    console.log('✅ Message inserted successfully!');
    console.log('   Database ID:', insertResult.rows[0].id);
    console.log('   Created at:', insertResult.rows[0].created_at);
    console.log('');

    // 7. Query messages back
    console.log('7️⃣ Querying messages back...');
    const queryResult = await pool.query(
      'SELECT * FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    console.log(`✅ Found ${queryResult.rows.length} messages for test user:`);
    queryResult.rows.forEach(msg => {
      console.log(`   - [${msg.sender}] ${msg.content.substring(0, 50)}... (${msg.session_id})`);
    });
    console.log('');

    // 8. Test conversation grouping (what admin panel uses)
    console.log('8️⃣ Testing conversation grouping (admin panel query)...');
    const conversationsResult = await pool.query(`
      SELECT
        session_id,
        COUNT(*) as message_count,
        MIN(created_at) as first_message_at,
        MAX(created_at) as last_message_at,
        (
          SELECT content
          FROM chat_history
          WHERE user_id = $1 AND session_id = ch.session_id
          ORDER BY created_at ASC
          LIMIT 1
        ) as preview
      FROM chat_history ch
      WHERE user_id = $1 AND session_id IS NOT NULL
      GROUP BY session_id
      ORDER BY last_message_at DESC
      LIMIT 5
    `, [userId]);

    console.log(`✅ Found ${conversationsResult.rows.length} conversations:`);
    conversationsResult.rows.forEach(conv => {
      console.log(`   - Session: ${conv.session_id}`);
      console.log(`     Messages: ${conv.message_count}`);
      console.log(`     Preview: ${conv.preview?.substring(0, 50)}...`);
      console.log('');
    });

    // 9. Summary
    console.log('═'.repeat(60));
    console.log('📊 DIAGNOSTIC SUMMARY');
    console.log('═'.repeat(60));
    console.log('✅ Database connection: OK');
    console.log('✅ chat_history table: EXISTS');
    console.log(`✅ Test user: ${testEmail} (${userId})`);
    console.log('✅ Message insertion: WORKING');
    console.log('✅ Message retrieval: WORKING');
    console.log('✅ Conversation grouping: WORKING');
    console.log('');
    console.log('🎉 All tests passed! Database is ready for chat messages.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Start the dev server: npm run dev');
    console.log('2. Send a chat message in the UI');
    console.log('3. Check browser console for [DB] logs');
    console.log('4. Check admin panel for conversations');

  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error);
    console.error('\nError details:', {
      name: (error as any).name,
      message: (error as Error).message,
      code: (error as any).code,
      detail: (error as any).detail,
      hint: (error as any).hint
    });
  } finally {
    await pool.end();
  }
}

// Run the test
testChatSave();
