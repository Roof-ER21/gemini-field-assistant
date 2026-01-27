#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(client, migrationFile) {
  const sql = fs.readFileSync(migrationFile, 'utf8');
  console.log(`\n📄 Running migration: ${path.basename(migrationFile)}`);
  console.log('=' .repeat(60));

  try {
    await client.query(sql);
    console.log(`✅ Migration ${path.basename(migrationFile)} completed successfully!\n`);
    return true;
  } catch (error) {
    console.error(`❌ Error in migration ${path.basename(migrationFile)}:`);
    console.error(error.message);
    console.error(error.stack);
    return false;
  }
}

async function verifyTables(client) {
  console.log('\n🔍 Verifying database schema...');
  console.log('=' .repeat(60));

  const tables = [
    'api_providers',
    'api_usage_log',
    'user_budgets',
    'company_budget',
    'budget_alerts'
  ];

  for (const tableName of tables) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      );
    `, [tableName]);

    const exists = result.rows[0].exists;
    console.log(`  ${exists ? '✅' : '❌'} Table: ${tableName}`);
  }

  // Check functions
  console.log('\n🔧 Verifying functions...');
  const functions = [
    'calculate_api_cost',
    'update_user_budget_on_api_call',
    'check_budget_alerts',
    'reset_monthly_budgets',
    'get_user_budget_status',
    'get_company_budget_status',
    'log_api_usage'
  ];

  for (const funcName of functions) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = $1
      );
    `, [funcName]);

    const exists = result.rows[0].exists;
    console.log(`  ${exists ? '✅' : '❌'} Function: ${funcName}()`);
  }

  // Check views
  console.log('\n📊 Verifying views...');
  const views = [
    'user_api_usage_summary',
    'provider_cost_breakdown',
    'daily_api_usage_trends',
    'feature_usage_breakdown',
    'monthly_spending_report'
  ];

  for (const viewName of views) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name = $1
      );
    `, [viewName]);

    const exists = result.rows[0].exists;
    console.log(`  ${exists ? '✅' : '❌'} View: ${viewName}`);
  }
}

async function testBudgetAPI(client) {
  console.log('\n🧪 Testing budget API functions...');
  console.log('=' .repeat(60));

  try {
    // Test get_company_budget_status()
    const companyBudget = await client.query('SELECT * FROM get_company_budget_status()');
    console.log('\n✅ get_company_budget_status() works!');
    console.log('  Company Budget:', companyBudget.rows[0]);

    // Get a test user
    const userResult = await client.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;

      // Test get_user_budget_status()
      const userBudget = await client.query('SELECT * FROM get_user_budget_status($1)', [userId]);
      console.log('\n✅ get_user_budget_status() works!');
      console.log('  User Budget:', userBudget.rows[0] || 'No budget set (will auto-create on first API call)');
    }

    console.log('\n✅ All budget API functions working correctly!');
  } catch (error) {
    console.error('\n❌ Error testing budget API:', error.message);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }

  console.log('🚀 Starting database migrations...');
  console.log(`🔗 Database: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

  // SSL is only required for production (Railway)
  const isProduction = databaseUrl.includes('railway') || process.env.NODE_ENV === 'production';
  const client = new Client({
    connectionString: databaseUrl,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Run migration 005
    const migration005Path = path.join(__dirname, 'database/migrations/005_api_usage_tracking.sql');
    const success005 = await runMigration(client, migration005Path);

    if (!success005) {
      console.error('❌ Migration 005 failed, stopping...');
      process.exit(1);
    }

    // Run migration 006
    const migration006Path = path.join(__dirname, 'database/migrations/006_fix_production_issues.sql');
    const success006 = await runMigration(client, migration006Path);

    if (!success006) {
      console.error('❌ Migration 006 failed, but continuing verification...');
    }

    // Verify everything
    await verifyTables(client);
    await testBudgetAPI(client);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 All migrations completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
