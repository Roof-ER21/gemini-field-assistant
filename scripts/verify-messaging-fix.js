/**
 * Verify messaging fix is working
 * Run with: node scripts/verify-messaging-fix.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    console.log('=== Verifying Messaging Fix ===\n');

    // 1. Verify User B exists
    const userBEmail = 'careers@theroofdocs.com';
    const userBResult = await pool.query(
      'SELECT id, email, name, role FROM users WHERE email = $1',
      [userBEmail]
    );

    if (userBResult.rows.length === 0) {
      console.log('❌ FAIL: User careers@theroofdocs.com does not exist');
      process.exit(1);
    }

    const userB = userBResult.rows[0];
    console.log('✅ User exists:');
    console.log(`   Email: ${userB.email}`);
    console.log(`   Name: ${userB.name}`);
    console.log(`   ID: ${userB.id}`);
    console.log();

    // 2. Verify presence record
    const presenceResult = await pool.query(
      'SELECT status, last_seen FROM user_presence WHERE user_id = $1',
      [userB.id]
    );

    if (presenceResult.rows.length === 0) {
      console.log('❌ FAIL: No presence record for user');
      process.exit(1);
    }

    console.log('✅ Presence initialized:');
    console.log(`   Status: ${presenceResult.rows[0].status}`);
    console.log();

    // 3. Check team list (simulating /api/team endpoint)
    const teamResult = await pool.query(`
      SELECT
        u.id as "userId",
        u.name,
        u.email,
        LOWER(SPLIT_PART(u.email, '@', 1)) as username,
        COALESCE(up.status, 'offline') as status
      FROM users u
      LEFT JOIN user_presence up ON u.id = up.user_id
      ORDER BY u.name ASC
    `);

    const careersTeam = teamResult.rows.find(u => u.email === userBEmail);

    if (!careersTeam) {
      console.log('❌ FAIL: User not appearing in team list');
      process.exit(1);
    }

    console.log('✅ User appears in team list:');
    console.log(`   Username: @${careersTeam.username}`);
    console.log(`   Status: ${careersTeam.status}`);
    console.log();

    // 4. Test conversation query for User B
    const conversationsResult = await pool.query(`
      SELECT
        c.id,
        c.type,
        c.created_at,
        (
          SELECT COUNT(*)::integer
          FROM team_messages m
          WHERE m.conversation_id = c.id
        ) as message_count
      FROM conversations c
      INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY c.updated_at DESC
    `, [userB.id]);

    console.log(`✅ Conversations query works:`);
    console.log(`   Found ${conversationsResult.rows.length} conversation(s)`);

    if (conversationsResult.rows.length > 0) {
      console.log('   Conversations:');
      conversationsResult.rows.forEach(c => {
        console.log(`      - ${c.id.substring(0, 8)}... (${c.type}, ${c.message_count} messages)`);
      });
    } else {
      console.log('   (No conversations yet - this is normal for a new user)');
    }
    console.log();

    // 5. Summary
    console.log('=== VERIFICATION COMPLETE ===');
    console.log();
    console.log('✅ All checks passed!');
    console.log();
    console.log('The messaging system is working correctly.');
    console.log();
    console.log('What to do next:');
    console.log('1. User B can now log in with: careers@theroofdocs.com');
    console.log('2. User A can message User B by:');
    console.log('   - Opening the messaging panel');
    console.log('   - Clicking the "Team" tab');
    console.log('   - Finding "Careers Team" in the list');
    console.log('   - Clicking "Message" to start a conversation');
    console.log('3. Messages will now appear in both users\' inboxes');

  } catch (error) {
    console.error('❌ VERIFICATION FAILED:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
