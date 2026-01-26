#!/usr/bin/env node

import pg from 'pg';
import { fileURLToPath } from 'url';

const { Client } = pg;

const expectedIndexes = [
  { name: 'idx_chat_history_user_session', table: 'chat_history', critical: true },
  { name: 'idx_chat_history_user_created', table: 'chat_history', critical: true },
  { name: 'idx_email_generation_log_user_created', table: 'email_generation_log', critical: true },
  { name: 'idx_concerning_chats_reviewed', table: 'concerning_chats', critical: true },
  { name: 'idx_concerning_chats_user_created', table: 'concerning_chats', critical: true },
  { name: 'idx_users_email_lower', table: 'users', critical: true },
  { name: 'idx_users_active', table: 'users', critical: false },
  { name: 'idx_budget_alerts_acknowledged', table: 'budget_alerts', critical: false },
  { name: 'idx_budget_alerts_user_acknowledged', table: 'budget_alerts', critical: false },
  { name: 'idx_api_usage_log_user_created', table: 'api_usage_log', critical: false },
  { name: 'idx_api_usage_log_provider_created', table: 'api_usage_log', critical: false },
  { name: 'idx_document_views_user_last_viewed', table: 'document_views', critical: false }
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }

  console.log('🔍 Verifying Performance Indexes...');
  console.log('=' .repeat(60));
  console.log('');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    let foundCount = 0;
    let missingCritical = [];
    let missingOptional = [];

    for (const index of expectedIndexes) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM pg_indexes
          WHERE schemaname = 'public'
          AND indexname = $1
        );
      `, [index.name]);

      const exists = result.rows[0].exists;

      if (exists) {
        // Get index size
        const sizeResult = await client.query(`
          SELECT pg_size_pretty(pg_relation_size($1::regclass)) as size
        `, [index.name]);

        const size = sizeResult.rows[0]?.size || 'unknown';
        console.log(`✅ ${index.name.padEnd(45)} ${size.padStart(10)}`);
        foundCount++;
      } else {
        if (index.critical) {
          console.log(`❌ ${index.name.padEnd(45)} MISSING (CRITICAL)`);
          missingCritical.push(index);
        } else {
          console.log(`⚠️  ${index.name.padEnd(45)} MISSING (optional)`);
          missingOptional.push(index);
        }
      }
    }

    console.log('');
    console.log('=' .repeat(60));
    console.log(`📊 Summary: ${foundCount}/${expectedIndexes.length} indexes found`);
    console.log('=' .repeat(60));

    if (missingCritical.length > 0) {
      console.log('');
      console.log('❌ CRITICAL INDEXES MISSING:');
      missingCritical.forEach(idx => {
        console.log(`   • ${idx.name} on ${idx.table}`);
      });
      console.log('');
      console.log('⚠️  Run the migration to create missing indexes:');
      console.log('   npm run db:migrate:performance:railway');
      process.exit(1);
    }

    if (missingOptional.length > 0) {
      console.log('');
      console.log('⚠️  Optional indexes missing (tables may not exist yet):');
      missingOptional.forEach(idx => {
        console.log(`   • ${idx.name} on ${idx.table}`);
      });
    }

    // Check index usage statistics
    console.log('');
    console.log('📈 Index Usage Statistics (last reset):');
    console.log('=' .repeat(60));

    const usageResult = await client.query(`
      SELECT
        indexname,
        idx_scan as scans,
        idx_tup_read as rows_read,
        idx_tup_fetch as rows_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      AND indexname = ANY($1::text[])
      ORDER BY idx_scan DESC;
    `, [expectedIndexes.map(i => i.name)]);

    if (usageResult.rows.length > 0) {
      console.log('');
      console.log('Index Name                                     Scans      Size');
      console.log('-'.repeat(60));
      usageResult.rows.forEach(row => {
        const scans = row.scans?.toLocaleString() || '0';
        console.log(`${row.indexname.padEnd(42)} ${scans.padStart(10)}  ${row.size}`);
      });

      const totalScans = usageResult.rows.reduce((sum, row) => sum + (parseInt(row.scans) || 0), 0);
      console.log('');
      console.log(`Total index scans: ${totalScans.toLocaleString()}`);

      if (totalScans === 0) {
        console.log('');
        console.log('💡 Indexes are ready but not used yet (recently created).');
        console.log('   Check again after 24 hours of production use.');
      }
    }

    // Performance recommendations
    console.log('');
    console.log('=' .repeat(60));
    console.log('💡 Performance Recommendations:');
    console.log('=' .repeat(60));

    // Check if ANALYZE has been run recently
    const analyzeResult = await client.query(`
      SELECT
        schemaname,
        tablename,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE tablename IN (
        'chat_history',
        'email_generation_log',
        'concerning_chats',
        'users',
        'budget_alerts'
      )
      ORDER BY GREATEST(last_analyze, last_autoanalyze) NULLS FIRST;
    `);

    const needsAnalyze = analyzeResult.rows.filter(row =>
      !row.last_analyze && !row.last_autoanalyze
    );

    if (needsAnalyze.length > 0) {
      console.log('');
      console.log('⚠️  Some tables need ANALYZE for optimal query planning:');
      needsAnalyze.forEach(row => {
        console.log(`   • ${row.tablename}`);
      });
      console.log('');
      console.log('   Run: npm run db:analyze');
    } else {
      console.log('');
      console.log('✅ All tables have statistics (ANALYZE has been run)');
    }

    console.log('');
    console.log('=' .repeat(60));
    console.log('✅ Performance Index Verification Complete!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
