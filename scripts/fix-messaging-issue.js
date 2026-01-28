/**
 * Fix messaging issue - Add missing user and verify conversations
 * Run with: node scripts/fix-messaging-issue.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    console.log('=== Messaging Fix Script ===\n');

    const userBEmail = 'careers@theroofdocs.com';

    // 1. Check if user exists
    console.log(`1. Checking if ${userBEmail} exists...`);
    const existingUser = await pool.query('SELECT id, email FROM users WHERE email = $1', [userBEmail]);

    let userBId;

    if (existingUser.rows.length === 0) {
      console.log(`   ❌ User NOT FOUND. Creating user...`);

      // Create the user
      const newUser = await pool.query(`
        INSERT INTO users (email, name, role, state)
        VALUES ($1, $2, 'sales_rep', 'VA')
        RETURNING id, email, name
      `, [userBEmail, 'Careers Team']);

      userBId = newUser.rows[0].id;
      console.log(`   ✅ Created user: ${newUser.rows[0].name} (${userBEmail})`);
      console.log(`      ID: ${userBId}`);

      // Initialize presence for new user
      await pool.query(`
        INSERT INTO user_presence (user_id, status, last_seen)
        VALUES ($1, 'offline', NOW())
        ON CONFLICT (user_id) DO NOTHING
      `, [userBId]);
      console.log(`   ✅ Initialized presence`);

    } else {
      userBId = existingUser.rows[0].id;
      console.log(`   ✅ User exists: ${userBEmail} (ID: ${userBId})`);
    }

    console.log();

    // 2. Check for existing conversations involving this user
    console.log('2. Checking for conversations...');
    const conversations = await pool.query(`
      SELECT c.id, c.type,
        (SELECT json_agg(u.email)
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = c.id) as participants
      FROM conversations c
      WHERE c.id IN (
        SELECT conversation_id FROM conversation_participants WHERE user_id = $1
      )
    `, [userBId]);

    console.log(`   Found ${conversations.rows.length} conversations`);
    conversations.rows.forEach(c => {
      console.log(`      ${c.id}: ${JSON.stringify(c.participants)}`);
    });

    console.log();

    // 3. Check for messages in conversations that should include this user
    console.log('3. Checking for messages sent to this user (but user not in participants)...');

    // Find all direct conversations
    const directConvs = await pool.query(`
      SELECT DISTINCT c.id, c.created_at,
        (SELECT array_agg(DISTINCT u.email ORDER BY u.email)
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = c.id) as current_participants,
        (SELECT COUNT(*) FROM team_messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      WHERE c.type = 'direct'
      ORDER BY c.created_at DESC
    `);

    console.log(`   Found ${directConvs.rows.length} direct conversations total`);

    let fixed = 0;
    for (const conv of directConvs.rows) {
      const participants = conv.current_participants || [];

      // Check if this conversation should include our user but doesn't
      if (conv.message_count > 0 && !participants.includes(userBEmail)) {
        // Check if any messages mention this user's email
        const mentioned = await pool.query(`
          SELECT m.id, m.content
          FROM team_messages m
          WHERE m.conversation_id = $1
          AND (
            m.content::text LIKE '%${userBEmail}%'
            OR EXISTS (
              SELECT 1 FROM message_mentions mm
              WHERE mm.message_id = m.id AND mm.mentioned_user_id = $2
            )
          )
          LIMIT 1
        `, [conv.id, userBId]);

        if (mentioned.rows.length > 0) {
          console.log(`   ⚠️  Found conversation ${conv.id.substring(0, 8)}... with messages but user not a participant`);
          console.log(`      Current participants: ${participants}`);
          console.log(`      Adding ${userBEmail} to conversation...`);

          await pool.query(`
            INSERT INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at)
            VALUES ($1, $2, NOW(), '1970-01-01')
            ON CONFLICT (conversation_id, user_id) DO NOTHING
          `, [conv.id, userBId]);

          fixed++;
          console.log(`      ✅ Fixed!`);
        }
      }
    }

    if (fixed > 0) {
      console.log(`   ✅ Fixed ${fixed} conversation(s)`);
    } else {
      console.log(`   ℹ️  No conversations needed fixing`);
    }

    console.log();

    // 4. Verify the fix
    console.log('4. Verification - Conversations now visible to user:');
    const finalConvs = await pool.query(`
      SELECT c.id, c.type,
        (SELECT array_agg(u.email ORDER BY u.email)
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = c.id) as participants,
        (SELECT COUNT(*) FROM team_messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY c.updated_at DESC
    `, [userBId]);

    console.log(`   User ${userBEmail} can now see ${finalConvs.rows.length} conversation(s):`);
    finalConvs.rows.forEach(c => {
      console.log(`      ${c.id.substring(0, 8)}... (${c.message_count} messages)`);
      console.log(`         Participants: ${c.participants}`);
    });

    console.log();
    console.log('=== Fix Complete ===');
    console.log();
    console.log('Next steps:');
    console.log(`1. Have User B (${userBEmail}) log in to the application`);
    console.log(`2. User B should now see any conversations in their inbox`);
    console.log(`3. If User A needs to send a new message, they should:`);
    console.log(`   - Go to Team tab`);
    console.log(`   - Find "Careers Team" in the list`);
    console.log(`   - Click "Message" to start/continue the conversation`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
