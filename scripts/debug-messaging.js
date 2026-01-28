/**
 * Debug script to investigate messaging issue
 * Run with: node scripts/debug-messaging.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    console.log('=== Debugging Messaging System ===\n');

    // 1. Check all users
    console.log('1. All Users:');
    const users = await pool.query('SELECT id, email, name FROM users ORDER BY created_at');
    users.rows.forEach(u => console.log(`   ${u.email} (ID: ${u.id})`));
    console.log();

    // Find User B (careers@theroofdocs.com)
    const userBEmail = 'careers@theroofdocs.com';
    const userBResult = await pool.query('SELECT id FROM users WHERE email = $1', [userBEmail]);

    if (userBResult.rows.length === 0) {
      console.log(`❌ User "${userBEmail}" not found in database!`);
      process.exit(1);
    }

    const userBId = userBResult.rows[0].id;
    console.log(`2. User B ("${userBEmail}") ID: ${userBId}\n`);

    // 2. Check all conversations
    console.log('3. All Conversations:');
    const convs = await pool.query(`
      SELECT c.id, c.type, c.created_at,
        (SELECT json_agg(u.email) FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = c.id) as participants
      FROM conversations c
      ORDER BY c.created_at DESC
    `);
    convs.rows.forEach(c => console.log(`   ${c.id} (${c.type}) - Participants: ${JSON.stringify(c.participants)}`));
    console.log();

    // 3. Check conversation participants for User B
    console.log('4. Conversations where User B is a participant:');
    const userBConvs = await pool.query(`
      SELECT cp.conversation_id, cp.joined_at, cp.last_read_at,
        c.type, c.created_at
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id
      WHERE cp.user_id = $1
      ORDER BY c.created_at DESC
    `, [userBId]);

    if (userBConvs.rows.length === 0) {
      console.log('   ⚠️  User B is NOT a participant in any conversations!');
    } else {
      userBConvs.rows.forEach(c => console.log(`   ${c.conversation_id} (${c.type}) joined: ${c.joined_at}`));
    }
    console.log();

    // 4. Check all messages
    console.log('5. All Messages:');
    const messages = await pool.query(`
      SELECT m.id, m.conversation_id, m.message_type, m.created_at,
        u.email as sender_email,
        m.content->>'text' as text
      FROM team_messages m
      JOIN users u ON u.id = m.sender_id
      ORDER BY m.created_at DESC
      LIMIT 20
    `);
    messages.rows.forEach(m => console.log(`   ${m.sender_email} → Conv ${m.conversation_id.substring(0, 8)}... : "${m.text || '(no text)'}"`));
    console.log();

    // 5. Test the actual query used by the API for User B
    console.log('6. Testing API Query for User B:');
    const apiResult = await pool.query(`
      SELECT
        c.id,
        c.type,
        c.name,
        c.created_by,
        c.created_at,
        c.updated_at,
        cp.last_read_at,
        cp.is_muted,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'user_id', u.id,
              'username', LOWER(SPLIT_PART(u.email, '@', 1)),
              'name', u.name,
              'email', u.email
            )
          )
          FROM conversation_participants cp2
          INNER JOIN users u ON u.id = cp2.user_id
          WHERE cp2.conversation_id = c.id
        ) as participants,
        (
          SELECT jsonb_build_object(
            'id', m.id,
            'sender_id', m.sender_id,
            'sender_name', u.name,
            'message_type', m.message_type,
            'content', m.content,
            'created_at', m.created_at
          )
          FROM team_messages m
          INNER JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*)::integer
          FROM team_messages m
          WHERE m.conversation_id = c.id
            AND m.created_at > cp.last_read_at
            AND m.sender_id != $1
        ) as unread_count
      FROM conversations c
      INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY c.updated_at DESC
    `, [userBId]);

    console.log(`   Found ${apiResult.rows.length} conversations for User B\n`);

    if (apiResult.rows.length === 0) {
      console.log('   ❌ PROBLEM FOUND: User B has NO conversations returned by API query!');
      console.log('   This means either:');
      console.log('      a) User B is not added to conversation_participants table');
      console.log('      b) The conversation was created without adding User B');
      console.log();
    } else {
      console.log('   ✅ User B has conversations:');
      apiResult.rows.forEach(c => {
        console.log(`      Conv ${c.id}:`);
        console.log(`         Type: ${c.type}`);
        console.log(`         Participants: ${JSON.stringify(c.participants)}`);
        console.log(`         Last Message: ${c.last_message ? 'Yes' : 'No'}`);
        console.log(`         Unread: ${c.unread_count}`);
      });
    }
    console.log();

    // 6. Check if there are conversations created but participants not added
    console.log('7. Orphaned Conversations (no participants):');
    const orphaned = await pool.query(`
      SELECT c.id, c.type, c.created_at
      FROM conversations c
      WHERE NOT EXISTS (
        SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id
      )
    `);

    if (orphaned.rows.length > 0) {
      console.log(`   ⚠️  Found ${orphaned.rows.length} conversations with NO participants!`);
      orphaned.rows.forEach(c => console.log(`      ${c.id} (${c.type}) created: ${c.created_at}`));
    } else {
      console.log('   ✅ No orphaned conversations');
    }
    console.log();

    console.log('=== Debug Complete ===');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
