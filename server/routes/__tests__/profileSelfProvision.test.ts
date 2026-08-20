/**
 * Test Suite: self-service QR profile provisioning
 *
 * Regression cover for the "new hires can't create a QR code" bug: nothing in
 * signup created an `employee_profiles` row (findOrCreateGoogleUser only touches
 * `users`) and every insert path was admin/marketing-gated, so a brand new
 * account got `{ profile: null }` from GET /api/profiles/me — which made
 * MyProfilePanel render "No Profile Yet / contact your admin" in place of BOTH
 * the QR code and the edit form, and made PUT /api/profiles/me 404.
 *
 * These are integration tests against a real Postgres (advisory locks, UNIQUE
 * slug + ON CONFLICT and concurrent transactions can't be faked usefully). They
 * create and drop their own throwaway database, and skip themselves entirely
 * when no local Postgres is reachable.
 *
 * Run: npx vitest run server/routes/__tests__/profileSelfProvision.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, Pool } from 'pg';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { createProfileRoutes, resolveOwnProfile } from '../profileRoutes.js';

const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ||
  `postgres://${process.env.PGUSER || process.env.USER || 'postgres'}@localhost:5432/postgres`;

const TEST_DB = `sa21_profile_test_${Math.random().toString(36).slice(2, 8)}`;
const testDbUrl = () => ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`);

async function postgresReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const PG_AVAILABLE = await postgresReachable();
if (!PG_AVAILABLE) {
  console.warn(`[profileSelfProvision] no Postgres at ${ADMIN_URL} — skipping suite`);
}
const suite = PG_AVAILABLE ? describe : describe.skip;

// Mirrors server/migrations/050_qr_profiles.sql (+ the created_by_email /
// updated_by_email columns server/index.ts adds at boot) and the columns of
// `users` these routes touch.
const SCHEMA = `
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'sales_rep',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE employee_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    role_type VARCHAR(50) DEFAULT 'sales_rep',
    email VARCHAR(255),
    phone_number VARCHAR(50),
    bio TEXT,
    image_url TEXT,
    slug VARCHAR(255) UNIQUE NOT NULL,
    start_year INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    is_claimed BOOLEAN DEFAULT FALSE,
    referral_count INTEGER DEFAULT 0,
    created_by_email TEXT,
    updated_by_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE profile_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255),
    description TEXT,
    url TEXT,
    thumbnail_url TEXT,
    is_welcome_video BOOLEAN DEFAULT FALSE,
    duration INTEGER,
    display_order INTEGER DEFAULT 0
  );
`;

suite('QR profile self-provisioning', () => {
  let pool: Pool;
  let server: Server;
  let baseUrl: string;
  let seq = 0;

  const uniqueEmail = (local: string) => `${local}.${seq++}@theroofdocs.com`;

  async function createUser(name: string | null, email: string): Promise<string> {
    const r = await pool.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, name],
    );
    return r.rows[0].id;
  }

  async function countProfiles(userId: string): Promise<number> {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM employee_profiles WHERE user_id = $1', [userId]);
    return r.rows[0].n;
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
    await admin.end();

    pool = new Pool({ connectionString: testDbUrl(), max: 10 });
    await pool.query(SCHEMA);

    const app = express();
    app.use(express.json());
    app.use('/api/profiles', createProfileRoutes(pool));
    // Bind explicitly to 127.0.0.1 — `request(app)`-style ephemeral binding has
    // produced cross-talk 404s on this machine before.
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) await pool.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.end();
  }, 30000);

  it('creates a profile for a user that has none (the new-hire case)', async () => {
    const email = uniqueEmail('jane.newhire');
    const userId = await createUser('Jane Newhire', email);

    expect(await countProfiles(userId)).toBe(0);

    const profile = await resolveOwnProfile(pool, userId, email, 'Jane Newhire');

    expect(profile).toBeTruthy();
    expect(profile.user_id).toBe(userId);
    expect(profile.name).toBe('Jane Newhire');
    expect(profile.email).toBe(email);
    expect(profile.slug).toBe('jane-newhire');
    expect(profile.is_claimed).toBe(true);
    // Deliberate: the QR code has to resolve, and the public page degrades
    // gracefully with no bio/photo, so a fresh profile is publicly reachable.
    expect(profile.is_active).toBe(true);
    // Self-provisioning is not admin activity — it must not show up in the QR
    // analytics "who created profiles" report.
    expect(profile.created_by_email).toBeNull();
    expect(await countProfiles(userId)).toBe(1);
  });

  it('falls back to the email local part when the user row has no name', async () => {
    const email = uniqueEmail('noname.rep');
    const userId = await createUser(null, email);

    const profile = await resolveOwnProfile(pool, userId, email, null);

    expect(profile).toBeTruthy();
    expect(profile.name).toBe(email.split('@')[0]);
    expect(profile.slug.startsWith('noname-rep')).toBe(true);
  });

  it('is idempotent under concurrent calls — no duplicate profile', async () => {
    const email = uniqueEmail('concurrent.rep');
    const userId = await createUser('Concurrent Rep', email);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => resolveOwnProfile(pool, userId, email, 'Concurrent Rep')),
    );

    expect(results.every((p) => p && p.id === results[0].id)).toBe(true);
    expect(await countProfiles(userId)).toBe(1);
  });

  it('leaves an already-linked profile untouched', async () => {
    const email = uniqueEmail('linked.rep');
    const userId = await createUser('Linked Rep', email);
    const existing = await pool.query(
      `INSERT INTO employee_profiles (name, title, bio, email, slug, user_id, is_claimed)
       VALUES ('Linked Rep', 'Senior Sales Rep', 'Existing bio', $1, 'linked-rep-original', $2, TRUE)
       RETURNING *`,
      [email, userId],
    );

    const profile = await resolveOwnProfile(pool, userId, email, 'Linked Rep');

    expect(profile.id).toBe(existing.rows[0].id);
    expect(profile.slug).toBe('linked-rep-original');
    expect(profile.title).toBe('Senior Sales Rep');
    expect(profile.bio).toBe('Existing bio');
    expect(profile.updated_at.getTime()).toBe(existing.rows[0].updated_at.getTime());
    expect(await countProfiles(userId)).toBe(1);
  });

  it('adopts an unclaimed email-matching profile instead of duplicating it', async () => {
    const email = uniqueEmail('adoptme.rep');
    const userId = await createUser('Adopt Me', email);
    const unclaimed = await pool.query(
      `INSERT INTO employee_profiles (name, email, slug, user_id, is_claimed)
       VALUES ('Adopt Me', $1, 'adopt-me-admin-made', NULL, FALSE)
       RETURNING *`,
      [email],
    );

    const profile = await resolveOwnProfile(pool, userId, email, 'Adopt Me');

    expect(profile.id).toBe(unclaimed.rows[0].id);
    expect(profile.slug).toBe('adopt-me-admin-made');
    expect(profile.user_id).toBe(userId);
    expect(profile.is_claimed).toBe(true);
    expect(await countProfiles(userId)).toBe(1);

    const total = await pool.query('SELECT COUNT(*)::int AS n FROM employee_profiles WHERE LOWER(email) = LOWER($1)', [email]);
    expect(total.rows[0].n).toBe(1);
  });

  it('adopts an unclaimed profile whose email differs only in case', async () => {
    const email = uniqueEmail('CaseCarol.Rep');
    const userId = await createUser('Case Carol', email.toLowerCase());
    const unclaimed = await pool.query(
      `INSERT INTO employee_profiles (name, email, slug, user_id, is_claimed)
       VALUES ('Case Carol', $1, 'case-carol-admin-made', NULL, FALSE)
       RETURNING id`,
      [email.toUpperCase()],
    );

    const profile = await resolveOwnProfile(pool, userId, email.toLowerCase(), 'Case Carol');

    expect(profile.id).toBe(unclaimed.rows[0].id);
    expect(await countProfiles(userId)).toBe(1);
  });

  it('retries with a fresh suffix when the natural slug is taken', async () => {
    const takenEmail = uniqueEmail('other.john');
    await pool.query(
      `INSERT INTO employee_profiles (name, email, slug, is_claimed)
       VALUES ('John Smith', $1, 'john-smith', FALSE)`,
      [takenEmail],
    );

    const email = uniqueEmail('john.smith');
    const userId = await createUser('John Smith', email);

    const profile = await resolveOwnProfile(pool, userId, email, 'John Smith');

    expect(profile).toBeTruthy();
    expect(profile.slug).not.toBe('john-smith');
    expect(profile.slug.startsWith('john-smith-')).toBe(true);
    expect(await countProfiles(userId)).toBe(1);
  });

  it('does not adopt a claimed profile belonging to someone else', async () => {
    const sharedEmail = uniqueEmail('shared.rep');
    const ownerId = await createUser('Owner Rep', uniqueEmail('owner.rep'));
    await pool.query(
      `INSERT INTO employee_profiles (name, email, slug, user_id, is_claimed)
       VALUES ('Owner Rep', $1, 'owner-rep-claimed', $2, TRUE)`,
      [sharedEmail, ownerId],
    );

    const userId = await createUser('Other Rep', sharedEmail);
    const profile = await resolveOwnProfile(pool, userId, sharedEmail, 'Other Rep');

    expect(profile.user_id).toBe(userId);
    expect(profile.slug).not.toBe('owner-rep-claimed');
    expect(await countProfiles(ownerId)).toBe(1);
    expect(await countProfiles(userId)).toBe(1);
  });

  describe('over HTTP', () => {
    it('GET /me returns a freshly provisioned profile for a brand-new account', async () => {
      const email = uniqueEmail('http.newhire');
      const userId = await createUser('Http Newhire', email);

      const res = await fetch(`${baseUrl}/api/profiles/me`, { headers: { 'x-user-email': email } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.profile).toBeTruthy();
      expect(body.profile.slug).toBe('http-newhire');
      expect(body.profile.user_id).toBe(userId);
      expect(await countProfiles(userId)).toBe(1);
    });

    it('two concurrent GET /me calls still yield exactly one profile', async () => {
      const email = uniqueEmail('http.race');
      const userId = await createUser('Http Race', email);

      const [a, b] = await Promise.all([
        fetch(`${baseUrl}/api/profiles/me`, { headers: { 'x-user-email': email } }).then((r) => r.json()),
        fetch(`${baseUrl}/api/profiles/me`, { headers: { 'x-user-email': email } }).then((r) => r.json()),
      ]);

      expect(a.profile.id).toBe(b.profile.id);
      expect(await countProfiles(userId)).toBe(1);
    });

    it('PUT /me succeeds for an account that never had a profile', async () => {
      const email = uniqueEmail('http.editor');
      const userId = await createUser('Http Editor', email);

      const res = await fetch(`${baseUrl}/api/profiles/me`, {
        method: 'PUT',
        headers: { 'x-user-email': email, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Sales Rep', bio: 'I fix roofs.', phone_number: '(555) 010-2030' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.profile.title).toBe('Sales Rep');
      expect(body.profile.bio).toBe('I fix roofs.');
      expect(await countProfiles(userId)).toBe(1);
    });

    it('GET /me still 404s for an email with no user account', async () => {
      const res = await fetch(`${baseUrl}/api/profiles/me`, {
        headers: { 'x-user-email': 'ghost@theroofdocs.com' },
      });
      expect(res.status).toBe(404);
      const n = await pool.query('SELECT COUNT(*)::int AS n FROM employee_profiles WHERE LOWER(email) = $1', ['ghost@theroofdocs.com']);
      expect(n.rows[0].n).toBe(0);
    });

    it('GET /me still 401s without an auth header', async () => {
      const res = await fetch(`${baseUrl}/api/profiles/me`);
      expect(res.status).toBe(401);
    });
  });

  // A hand-typed email that matches no account used to strand the profile
  // forever; now that GET /me self-provisions it would silently produce a
  // second profile instead. The admin routes normalise the address, link it,
  // and warn when they can't.
  describe('admin-entered profile emails', () => {
    let adminEmail: string;
    const adminHeaders = () => ({ 'x-user-email': adminEmail, 'Content-Type': 'application/json' });

    beforeAll(async () => {
      adminEmail = uniqueEmail('qr.admin');
      const r = await pool.query(
        `INSERT INTO users (email, name, role) VALUES ($1, 'QR Admin', 'admin') RETURNING id`,
        [adminEmail],
      );
      expect(r.rows[0].id).toBeTruthy();
    });

    it('links a new profile to the account whose email matches', async () => {
      const repEmail = uniqueEmail('match.rep');
      const repId = await createUser('Match Rep', repEmail);

      const res = await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ name: 'Match Rep', email: repEmail }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.warning).toBeUndefined();
      expect(body.profile.user_id).toBe(repId);
      expect(body.profile.is_claimed).toBe(true);

      // The rep now resolves to that exact row instead of getting a second one.
      const mine = await resolveOwnProfile(pool, repId, repEmail, 'Match Rep');
      expect(mine.id).toBe(body.profile.id);
      expect(await countProfiles(repId)).toBe(1);
    });

    it('normalises whitespace and case so the match is not missed', async () => {
      const repEmail = uniqueEmail('spacey.rep');
      const repId = await createUser('Spacey Rep', repEmail);

      const res = await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ name: 'Spacey Rep', email: `  ${repEmail.toUpperCase()} ` }),
      });
      const body = await res.json();

      expect(body.profile.email).toBe(repEmail.toLowerCase());
      expect(body.profile.user_id).toBe(repId);
      expect(body.warning).toBeUndefined();
    });

    it('warns when the email matches no SA21 account (the typo case)', async () => {
      const res = await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ name: 'Typo Rep', email: 'jhon.doe.typo@theroofdocs.com' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.profile.user_id).toBeNull();
      expect(body.warning).toContain('jhon.doe.typo@theroofdocs.com');
      expect(body.warning).toMatch(/typo/i);
    });

    it('re-links an orphaned profile when the admin fixes the typo', async () => {
      const repEmail = uniqueEmail('fixed.rep');
      const repId = await createUser('Fixed Rep', repEmail);

      const created = await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ name: 'Fixed Rep', email: 'fixedd.rep.typo@theroofdocs.com' }),
      }).then((r) => r.json());
      expect(created.profile.user_id).toBeNull();

      const fixed = await fetch(`${baseUrl}/api/profiles/${created.profile.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ email: repEmail }),
      }).then((r) => r.json());

      expect(fixed.warning).toBeUndefined();
      expect(fixed.profile.user_id).toBe(repId);
      expect(fixed.profile.is_claimed).toBe(true);
      expect(await countProfiles(repId)).toBe(1);
    });

    it('warns instead of linking when the account already owns another profile', async () => {
      const repEmail = uniqueEmail('dupe.rep');
      const repId = await createUser('Dupe Rep', repEmail);
      await resolveOwnProfile(pool, repId, repEmail, 'Dupe Rep'); // rep logged in first

      const res = await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ name: 'Dupe Rep', email: repEmail }),
      });
      const body = await res.json();

      expect(body.profile.user_id).toBeNull();
      expect(body.warning).toMatch(/already has another QR profile/i);
      expect(await countProfiles(repId)).toBe(1);
    });

    it('still refuses profile creation and editing for non-admins', async () => {
      const repEmail = uniqueEmail('nosy.rep');
      await createUser('Nosy Rep', repEmail);

      const created = await fetch(`${baseUrl}/api/profiles`, {
        method: 'POST',
        headers: { 'x-user-email': repEmail, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nosy Rep' }),
      });
      expect(created.status).toBe(403);

      const listed = await fetch(`${baseUrl}/api/profiles`, { headers: { 'x-user-email': repEmail } });
      expect(listed.status).toBe(403);

      const bulk = await fetch(`${baseUrl}/api/profiles/bulk-generate`, {
        method: 'POST',
        headers: { 'x-user-email': repEmail, 'Content-Type': 'application/json' },
      });
      expect(bulk.status).toBe(403);
    });
  });
});
