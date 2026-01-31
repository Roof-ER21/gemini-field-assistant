#!/usr/bin/env node
/**
 * Update All-Time Revenue for Sales Reps
 * Source: RoofTrack App Screenshots (January 31, 2026)
 */

import pg from 'pg';
const { Pool } = pg;

const revenueData = [
  { name: 'Luis Esteves', revenue: 9304576.75 },
  { name: 'Richie Riley', revenue: 5703722.32 },
  { name: 'Ross Renzi', revenue: 5296700.77 },
  { name: 'Patrick Robertson', revenue: 4732226.18 },
  { name: 'Michael Swearingen', revenue: 3537682.37 },
  { name: 'Carlos Davila', revenue: 3239593.21 },
  { name: 'Andre Mealy', revenue: 2923363.59 },
  { name: 'Miguel Ocampo', revenue: 2745390.97 },
  { name: 'Jason Brown', revenue: 2455179.30 },
  { name: 'Nick Bourdin', revenue: 2371228.72 },
  { name: 'Navid Javid', revenue: 1922119.33 },
  { name: 'Benjamin Salgado', revenue: 1920129.45 },
  { name: 'Shane Santangelo', revenue: 1850868.33 },
  { name: 'Larry Hale', revenue: 1667234.09 },
  { name: 'Reese Samala', revenue: 1278709.25 },
  { name: 'Ryan Parker', revenue: 1136912.38 },
  { name: 'Mattias Kasparian', revenue: 1113901.42 },
  { name: 'Chris Aycock', revenue: 1000793.08 },
  { name: 'Steve McKim', revenue: 982417.46 },
  { name: 'James Armel', revenue: 955266.51 },
  { name: 'Christian Bratton', revenue: 861899.03 },
  { name: 'Eric Philippeau', revenue: 800615.78 },
  { name: 'Elijah Hicks', revenue: 776289.34 },
  { name: 'Brandon Pernot', revenue: 731012.83 },
  { name: 'Daniel Alonso', revenue: 705337.68 },
  { name: 'Joseph Marcella', revenue: 688377.42 },
  { name: 'Jimmy Brown', revenue: 631532.89 },
  { name: 'Joseph Ammendola', revenue: 603400.63 },
  { name: 'Danny Ticktin', revenue: 571082.75 },
  { name: 'Ian Thrash', revenue: 523038.90 },
  { name: 'Ryan Kiely', revenue: 460311.26 },
  { name: 'Eric Rickel', revenue: 459134.43 },
  { name: 'Basel Halim', revenue: 375337.84 },
  { name: 'Freddy Zellers', revenue: 339804.85 },
  { name: 'Jonathan Alquijay', revenue: 326115.07 },
  { name: 'Hunter Hall', revenue: 278503.90 },
  { name: 'Joseph Boyd', revenue: 251158.93 },
  { name: 'Hugo Manrique', revenue: 236185.25 },
  { name: 'Colin Koos', revenue: 225607.10 },
  { name: 'Humberto Berrio', revenue: 183468.15 },
  { name: 'Kerouls Gayed', revenue: 135702.49 },
  { name: 'Abraham Raz', revenue: 134248.76 },
  { name: 'Jalen Simms', revenue: 112414.12 },
  { name: 'Gabe Long', revenue: 74680.21 },
  { name: 'Angel Ardid-Balmes', revenue: 66110.35 },
  { name: 'David Sura', revenue: 64403.52 },
  { name: 'Joseph Hong', revenue: 56286.67 },
  { name: 'Devin Fraser', revenue: 52631.06 },
  { name: 'Walid Saidani', revenue: 45510.29 },
  { name: 'Ahmed Mahmoud', revenue: 43772.71 },
  { name: 'Michael Gabriel', revenue: 35037.70 },
  { name: 'Rodrigo Lopez', revenue: 32341.47 },
  { name: 'George Gerdes', revenue: 24827.96 },
  { name: 'Jamal Washington', revenue: 21419.00 },
  { name: 'Aryk Smith', revenue: 15272.30 },
  { name: 'Jonathan Rivera', revenue: 14625.50 },
  { name: 'Fabrizio Gonzalez', revenue: 6722.61 }
];

async function updateAllTimeRevenue() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
  });

  console.log('🚀 Starting all-time revenue update...');
  console.log(`📊 Total records to update: ${revenueData.length}`);
  console.log(`💰 Total revenue: $${revenueData.reduce((sum, r) => sum + r.revenue, 0).toLocaleString()}`);
  console.log('');

  let updated = 0;
  let notFound = [];

  try {
    for (const { name, revenue } of revenueData) {
      // Split name into parts for flexible matching
      const nameParts = name.toLowerCase().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];

      const result = await pool.query(`
        UPDATE sales_reps
        SET all_time_revenue = $1, updated_at = NOW()
        WHERE LOWER(name) LIKE $2
           OR (LOWER(name) LIKE $3 AND LOWER(name) LIKE $4)
        RETURNING id, name, all_time_revenue
      `, [revenue, `%${firstName}%${lastName}%`, `%${firstName}%`, `%${lastName}%`]);

      if (result.rowCount > 0) {
        updated++;
        console.log(`✅ ${name}: $${revenue.toLocaleString()} → ${result.rows[0].name}`);
      } else {
        notFound.push(name);
        console.log(`⚠️  ${name}: NOT FOUND in database`);
      }
    }

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Updated: ${updated}/${revenueData.length} reps`);

    if (notFound.length > 0) {
      console.log(`⚠️  Not found: ${notFound.length}`);
      console.log('   Missing:', notFound.join(', '));
    }

    // Show top 10 after update
    const topReps = await pool.query(`
      SELECT name, all_time_revenue
      FROM sales_reps
      WHERE all_time_revenue > 0
      ORDER BY all_time_revenue DESC
      LIMIT 10
    `);

    console.log('');
    console.log('📈 Top 10 All-Time Revenue:');
    topReps.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.name}: $${parseFloat(row.all_time_revenue).toLocaleString()}`);
    });

  } catch (error) {
    console.error('❌ Error updating revenue:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateAllTimeRevenue();
