/**
 * Team Sync Service
 * Syncs teams and territories from Neon RoofTrack database to local Gemini database
 */

import { Pool } from 'pg';

// Neon database connection (source of truth for teams)
const neonPool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL ||
    'postgresql://neondb_owner:npg_QyiNKbuG4d0l@ep-long-resonance-adkdg81l-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

// Local Gemini database connection
const localPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

interface NeonTeam {
  id: number;
  name: string;
  leader_id: number | null;
  is_active: boolean;
}

interface NeonTerritory {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface NeonSalesRep {
  id: number;
  name: string;
  email: string | null;
  team_id: number | null;
  territory_id: number | null;
}

interface SyncResult {
  success: boolean;
  teamsSync: { inserted: number; updated: number };
  territoriesSync: { inserted: number; updated: number };
  repsSync: { matched: number; updated: number };
  errors: string[];
}

/**
 * Sync teams from Neon to local database
 */
async function syncTeams(): Promise<{ inserted: number; updated: number; teamMap: Map<number, number> }> {
  const neonClient = await neonPool.connect();
  const localClient = await localPool.connect();

  try {
    // Get teams from Neon
    const neonTeamsResult = await neonClient.query<NeonTeam>(`
      SELECT id, name, leader_id, is_active
      FROM sales.teams
      ORDER BY id
    `);

    let inserted = 0;
    let updated = 0;
    const teamMap = new Map<number, number>(); // neon_id -> local_id

    for (const team of neonTeamsResult.rows) {
      // Check if team exists locally by neon_id
      const existingResult = await localClient.query(
        'SELECT id FROM teams WHERE neon_id = $1',
        [team.id]
      );

      if (existingResult.rows.length > 0) {
        // Update existing team
        await localClient.query(`
          UPDATE teams
          SET name = $1, is_active = $2, updated_at = NOW()
          WHERE neon_id = $3
        `, [team.name, team.is_active, team.id]);
        updated++;
        teamMap.set(team.id, existingResult.rows[0].id);
      } else {
        // Insert new team
        const insertResult = await localClient.query(`
          INSERT INTO teams (neon_id, name, is_active)
          VALUES ($1, $2, $3)
          RETURNING id
        `, [team.id, team.name, team.is_active]);
        inserted++;
        teamMap.set(team.id, insertResult.rows[0].id);
      }
    }

    return { inserted, updated, teamMap };
  } finally {
    neonClient.release();
    localClient.release();
  }
}

/**
 * Sync territories from Neon to local database
 */
async function syncTerritories(): Promise<{ inserted: number; updated: number; territoryMap: Map<number, number> }> {
  const neonClient = await neonPool.connect();
  const localClient = await localPool.connect();

  try {
    // Get territories from Neon
    const neonTerrResult = await neonClient.query<NeonTerritory>(`
      SELECT id, name, description, is_active
      FROM sales.territories
      ORDER BY id
    `);

    let inserted = 0;
    let updated = 0;
    const territoryMap = new Map<number, number>(); // neon_id -> local_id

    for (const terr of neonTerrResult.rows) {
      // Check if territory exists locally by neon_id
      const existingResult = await localClient.query(
        'SELECT id FROM team_territories WHERE neon_id = $1',
        [terr.id]
      );

      if (existingResult.rows.length > 0) {
        // Update existing territory
        await localClient.query(`
          UPDATE team_territories
          SET name = $1, description = $2, is_active = $3, updated_at = NOW()
          WHERE neon_id = $4
        `, [terr.name, terr.description, terr.is_active, terr.id]);
        updated++;
        territoryMap.set(terr.id, existingResult.rows[0].id);
      } else {
        // Insert new territory
        const insertResult = await localClient.query(`
          INSERT INTO team_territories (neon_id, name, description, is_active)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [terr.id, terr.name, terr.description, terr.is_active]);
        inserted++;
        territoryMap.set(terr.id, insertResult.rows[0].id);
      }
    }

    return { inserted, updated, territoryMap };
  } finally {
    neonClient.release();
    localClient.release();
  }
}

/**
 * Match and update sales reps with team/territory assignments
 */
async function syncSalesRepAssignments(
  teamMap: Map<number, number>,
  territoryMap: Map<number, number>
): Promise<{ matched: number; updated: number }> {
  const neonClient = await neonPool.connect();
  const localClient = await localPool.connect();

  try {
    // Get sales reps from Neon with their team/territory assignments
    const neonRepsResult = await neonClient.query<NeonSalesRep>(`
      SELECT id, name, email, team_id, territory_id
      FROM sales.sales_reps
      WHERE is_active = true
      ORDER BY id
    `);

    let matched = 0;
    let updated = 0;

    for (const neonRep of neonRepsResult.rows) {
      // Try to match by email first, then by name
      let localRepResult = await localClient.query(
        'SELECT id FROM sales_reps WHERE LOWER(email) = LOWER($1)',
        [neonRep.email]
      );

      if (localRepResult.rows.length === 0 && neonRep.name) {
        // Try matching by name (case insensitive)
        localRepResult = await localClient.query(
          'SELECT id FROM sales_reps WHERE LOWER(name) = LOWER($1)',
          [neonRep.name]
        );
      }

      if (localRepResult.rows.length > 0) {
        matched++;
        const localRepId = localRepResult.rows[0].id;

        // Map Neon team_id and territory_id to local IDs
        const localTeamId = neonRep.team_id ? teamMap.get(neonRep.team_id) || null : null;
        const localTerritoryId = neonRep.territory_id ? territoryMap.get(neonRep.territory_id) || null : null;

        // Update sales rep with team and territory
        const updateResult = await localClient.query(`
          UPDATE sales_reps
          SET team_id = $1, territory_id = $2, updated_at = NOW()
          WHERE id = $3 AND (team_id IS DISTINCT FROM $1 OR territory_id IS DISTINCT FROM $2)
        `, [localTeamId, localTerritoryId, localRepId]);

        if (updateResult.rowCount && updateResult.rowCount > 0) {
          updated++;
        }
      }
    }

    return { matched, updated };
  } finally {
    neonClient.release();
    localClient.release();
  }
}

/**
 * Update team leaders after reps are synced
 */
async function syncTeamLeaders(teamMap: Map<number, number>): Promise<number> {
  const neonClient = await neonPool.connect();
  const localClient = await localPool.connect();

  try {
    // Get team leaders from Neon
    const neonTeamsResult = await neonClient.query<NeonTeam>(`
      SELECT t.id, t.leader_id, sr.name as leader_name, sr.email as leader_email
      FROM sales.teams t
      LEFT JOIN sales.sales_reps sr ON t.leader_id = sr.id
      WHERE t.leader_id IS NOT NULL
    `);

    let updated = 0;

    for (const team of neonTeamsResult.rows) {
      const localTeamId = teamMap.get(team.id);
      if (!localTeamId) continue;

      // Find the local sales_rep matching the leader
      const leaderResult = await localClient.query(`
        SELECT id FROM sales_reps
        WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($2)
        LIMIT 1
      `, [team.leader_name, team.leader_email]);

      if (leaderResult.rows.length > 0) {
        await localClient.query(`
          UPDATE teams SET leader_id = $1, updated_at = NOW()
          WHERE id = $2 AND leader_id IS DISTINCT FROM $1
        `, [leaderResult.rows[0].id, localTeamId]);
        updated++;
      }
    }

    return updated;
  } finally {
    neonClient.release();
    localClient.release();
  }
}

/**
 * Full sync of teams, territories, and sales rep assignments
 */
export async function syncTeamsFromNeon(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    teamsSync: { inserted: 0, updated: 0 },
    territoriesSync: { inserted: 0, updated: 0 },
    repsSync: { matched: 0, updated: 0 },
    errors: []
  };

  try {
    console.log('[TeamSync] Starting sync from Neon database...');

    // Step 1: Sync teams
    console.log('[TeamSync] Syncing teams...');
    const teamResult = await syncTeams();
    result.teamsSync = { inserted: teamResult.inserted, updated: teamResult.updated };
    console.log(`[TeamSync] Teams: ${teamResult.inserted} inserted, ${teamResult.updated} updated`);

    // Step 2: Sync territories
    console.log('[TeamSync] Syncing territories...');
    const terrResult = await syncTerritories();
    result.territoriesSync = { inserted: terrResult.inserted, updated: terrResult.updated };
    console.log(`[TeamSync] Territories: ${terrResult.inserted} inserted, ${terrResult.updated} updated`);

    // Step 3: Sync sales rep assignments
    console.log('[TeamSync] Syncing sales rep assignments...');
    const repsResult = await syncSalesRepAssignments(teamResult.teamMap, terrResult.territoryMap);
    result.repsSync = repsResult;
    console.log(`[TeamSync] Sales Reps: ${repsResult.matched} matched, ${repsResult.updated} updated`);

    // Step 4: Update team leaders
    console.log('[TeamSync] Syncing team leaders...');
    const leadersUpdated = await syncTeamLeaders(teamResult.teamMap);
    console.log(`[TeamSync] Team leaders updated: ${leadersUpdated}`);

    result.success = true;
    console.log('[TeamSync] Sync completed successfully!');

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMsg);
    console.error('[TeamSync] Error during sync:', errorMsg);
  }

  return result;
}

/**
 * Get all teams with their leaders
 */
export async function getTeams(): Promise<any[]> {
  const client = await localPool.connect();
  try {
    const result = await client.query(`
      SELECT
        t.id,
        t.name,
        t.is_active,
        t.created_at,
        sr.id as leader_id,
        sr.name as leader_name,
        sr.email as leader_email,
        (SELECT COUNT(*) FROM sales_reps WHERE team_id = t.id) as member_count
      FROM teams t
      LEFT JOIN sales_reps sr ON t.leader_id = sr.id
      ORDER BY t.name
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get all territories
 */
export async function getTerritories(): Promise<any[]> {
  const client = await localPool.connect();
  try {
    const result = await client.query(`
      SELECT
        id,
        name,
        description,
        is_active,
        created_at,
        (SELECT COUNT(*) FROM sales_reps WHERE territory_id = team_territories.id) as rep_count
      FROM team_territories
      ORDER BY name
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get team members
 */
export async function getTeamMembers(teamId: number): Promise<any[]> {
  const client = await localPool.connect();
  try {
    const result = await client.query(`
      SELECT
        sr.id,
        sr.name,
        sr.email,
        sr.phone,
        sr.team_id,
        t.name as team_name,
        sr.territory_id,
        tt.name as territory_name,
        sr.is_active
      FROM sales_reps sr
      LEFT JOIN teams t ON sr.team_id = t.id
      LEFT JOIN team_territories tt ON sr.territory_id = tt.id
      WHERE sr.team_id = $1
      ORDER BY sr.name
    `, [teamId]);
    return result.rows;
  } finally {
    client.release();
  }
}

export default {
  syncTeamsFromNeon,
  getTeams,
  getTerritories,
  getTeamMembers
};
