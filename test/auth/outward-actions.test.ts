/**
 * Stage 1.5 — Susan may read for an unverified caller, but she may not act.
 *
 * `/api/susan/agent/chat` identified its caller from the `x-user-email` header
 * (susanAgentRoutes.ts), and the agent's toolset includes `send_email`,
 * `create_calendar_event`, `send_notification` and `share_team_intel`. So while
 * the header remained an identity, guessing a rep's address was enough to make
 * Susan send mail as Roof-ER. Reads keep working through the staged rollout;
 * these four refuse until the caller holds a real session.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import {
  OUTWARD_ACTION_TOOLS,
  SUSAN_TOOLS,
  executeTool,
  type ToolContext,
} from '../../server/services/susanToolService';

/** A pool that fails loudly, so a tool that runs is unmistakable from one that was refused. */
const explodingPool = { query: vi.fn(async () => { throw new Error('pool must not be reached'); }) } as any;

function ctx(hasVerifiedSession: boolean | undefined): ToolContext {
  return {
    userId: '11111111-1111-1111-1111-111111111111',
    userEmail: 'real.rep@theroofdocs.com',
    userName: 'Real Rep',
    userState: 'VA',
    pool: explodingPool,
    hasVerifiedSession,
  };
}

const OUTWARD = [...OUTWARD_ACTION_TOOLS];

describe('an unverified caller cannot make Susan act outward', () => {
  for (const name of OUTWARD) {
    it(`${name} refuses without a verified session`, async () => {
      const result = await executeTool(name, {}, ctx(undefined));
      expect(result.result.success).toBe(false);
      expect(result.result.needsSignIn).toBe(true);
      expect(String(result.result.error)).toMatch(/sign in again/i);
      // Refused before anything ran — the pool was never touched.
      expect(explodingPool.query).not.toHaveBeenCalled();
    });
  }

  it('an explicit false is refused too, not just a missing flag', async () => {
    const result = await executeTool('send_email', {}, ctx(false));
    expect(result.result.needsSignIn).toBe(true);
  });

  it('a verified session is let through to the tool itself', async () => {
    // It will fail on the exploding pool — that is the point: it RAN.
    const result = await executeTool('send_email', {}, ctx(true));
    expect(result.result.needsSignIn).toBeUndefined();
    expect(explodingPool.query).toHaveBeenCalled();
  });
});

describe('the gate blocks acting, not reading', () => {
  const readTools = SUSAN_TOOLS.map((t) => t.name!).filter((n) => !OUTWARD_ACTION_TOOLS.has(n));

  it('there are still plenty of tools an unverified caller can use', () => {
    expect(readTools.length).toBeGreaterThan(8);
  });

  for (const name of ['get_job_details', 'search_knowledge_base', 'lookup_insurance_company', 'fetch_calendar_events']) {
    it(`${name} is not gated`, async () => {
      expect(OUTWARD_ACTION_TOOLS.has(name)).toBe(false);
      const result = await executeTool(name, {}, ctx(undefined));
      expect(result.result.needsSignIn).toBeUndefined();
    });
  }
});

describe('a new outward-acting tool cannot be added without classifying it', () => {
  // The gate is a list, and a list goes stale silently. This is the trip-wire:
  // any tool whose name suggests it leaves the building must either be gated or
  // be named here as deliberately internal, with the reason.
  const REVIEWED_INTERNAL: Record<string, string> = {
    draft_email: 'composes text and returns it; nothing is sent',
    schedule_followup: "writes a row on the rep's own task list",
    save_client_note: "writes a note on the rep's own record",
    record_claim_outcome: 'writes an outcome the rep already knows',
    generate_storm_report: 'renders a report back to the caller',
    check_availability: 'reads a calendar',
    fetch_calendar_events: 'reads a calendar',
  };
  const SUSPICIOUS = /^(send|create|share|post|notify|schedule|save|record|generate|draft|update|delete|email)/;

  for (const tool of SUSAN_TOOLS) {
    const name = tool.name!;
    if (!SUSPICIOUS.test(name)) continue;
    it(`${name} is either gated or explicitly reviewed as internal`, () => {
      const gated = OUTWARD_ACTION_TOOLS.has(name);
      const reviewed = name in REVIEWED_INTERNAL;
      expect(
        gated || reviewed,
        `"${name}" looks like it acts. Add it to OUTWARD_ACTION_TOOLS, or to REVIEWED_INTERNAL here with the reason it is safe.`,
      ).toBe(true);
    });
  }

  it('every gated name is a real tool, so the list cannot rot into a no-op', () => {
    const real = new Set(SUSAN_TOOLS.map((t) => t.name!));
    for (const name of OUTWARD_ACTION_TOOLS) {
      expect(real.has(name), `OUTWARD_ACTION_TOOLS names "${name}", which is not a tool`).toBe(true);
    }
  });
});

describe("Susan's agent does not mint accounts for whoever asks", () => {
  // `resolveUserId` used to INSERT a users row for any address in the header,
  // with no account, no credential and no domain check, and then run an agent
  // turn for it. A new rep gets their account from Google sign-in instead.
  const source = readFileSync(
    new URL('../../server/routes/susanAgentRoutes.ts', import.meta.url),
    'utf8',
  );

  it('the agent route never inserts into users', () => {
    const inserts = source.match(/INSERT\s+INTO\s+users/gi) || [];
    expect(
      inserts,
      'susanAgentRoutes must not create accounts — an unknown address is a 401, not a signup',
    ).toEqual([]);
  });

  it('an unresolvable caller is refused without being told what resolved', () => {
    expect(source).toMatch(/refusing rather than creating one/);
    // The refusal must not echo the caller's own string back to them.
    expect(source).not.toMatch(/Could not resolve or create user for email/);
  });
});
