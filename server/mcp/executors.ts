/**
 * MCP tool executors — run the SAME Express handlers the REST routes use,
 * in-process, through the shim. No loopback fetch. The handlers are injected
 * by server/index.ts (three of them are closures over its pool), so this
 * module imports no DB and test/mcp can hand it fakes.
 *
 *   ask                → POST /api/susan/chat        { message }          (susanRoutes.ts — a Gemini call)
 *   carrier_directory  → GET  /api/insurance/companies ?q=&limit=          (server/index.ts)
 *   carrier_learnings  → GET  /api/learning/global     ?insurer=&limit=    (server/index.ts)
 *   adjuster_learnings → GET  /api/learning/global     ?adjuster=&limit=   (server/index.ts)
 *   rep_directory      → GET  /api/team                (messagingRoutes.ts) narrowed here by `q`, LIMIT 10
 *
 * Each result is cut to the fields Genie's ask_susan skill names (genie21
 * src/lib/susan/tools.ts `narrow`), on THIS side, so what leaves the server
 * is only those fields: the roster's presence columns and a learning's author
 * never travel. Error text handed back is short and hostname-free; the
 * handler's own message is never echoed (some carry `error.message` from pg).
 */
import type { McpCaller, McpExecResult, McpExecutors } from './server.js';
import { runHandler, type Captured, type Handler } from './shim.js';

export interface McpHandlers {
  susanChat: Handler;
  insuranceCompanies: Handler;
  learningGlobal: Handler;
  team: Handler;
}

/** Genie's own row cap, and the tighter one this endpoint puts on the roster. */
export const MCP_MAX_ROWS = 25;
export const MCP_LEARNING_MAX_ROWS = 20;
export const MCP_REP_MAX_ROWS = 10;

const CARRIER_FIELDS = ['name', 'state', 'phone', 'email', 'address', 'website', 'category', 'notes'] as const;
const LEARNING_FIELDS = ['content', 'scope_state', 'scope_insurer', 'scope_adjuster', 'helpful_count', 'updated_at'] as const;
const REP_FIELDS = ['name', 'email', 'username'] as const;

function pick(row: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = (row as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Project a list to the named fields, bounded. Same shape Genie's `narrow` produces. */
export function rows(list: unknown, keys: readonly string[], max: number, keep: (row: Record<string, unknown>) => boolean = () => true) {
  if (!Array.isArray(list)) return { totalMatching: 0, countReturned: 0, rows: [] as Record<string, unknown>[] };
  const matched = list.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row) && keep(row));
  const projected = matched.slice(0, max).map((row) => pick(row, keys)!);
  return { totalMatching: matched.length, countReturned: projected.length, rows: projected };
}

function failed(tool: string, captured: Captured): McpExecResult {
  // 4xx from the handler is the caller's input; 5xx is ours. Neither message is echoed.
  const kind = captured.status >= 500 ? 'could not answer right now' : `refused the request (status ${captured.status})`;
  return { ok: false, data: null, error: `${tool} ${kind}.` };
}

function ok(captured: Captured): boolean {
  return captured.status >= 200 && captured.status < 300;
}

/** An optional "limit" argument, already pattern-checked as 1–2 digits, clamped to [1, max]. */
function clampLimit(raw: string | undefined, max: number): string {
  const n = raw === undefined ? max : Number(raw);
  return String(Math.min(max, Math.max(1, Number.isFinite(n) ? n : max)));
}

export function createExecutors(handlers: McpHandlers): McpExecutors {
  const get = (handler: Handler, query: Record<string, string>, caller: McpCaller) =>
    runHandler(handler, { method: 'GET', query, identity: caller });

  return {
    ask: async (args, caller) => {
      const captured = await runHandler(handlers.susanChat, { method: 'POST', body: { message: args.message }, identity: caller });
      if (!ok(captured)) return failed('ask', captured);
      const body = pick(captured.body, ['success', 'response', 'metadata']);
      const metadata = pick(body?.metadata, ['mode', 'confidence']);
      return {
        ok: true,
        data: {
          response: typeof body?.response === 'string' ? body.response : null,
          mode: typeof metadata?.mode === 'string' ? metadata.mode : 'session',
          ...(typeof metadata?.confidence === 'number' ? { confidence: metadata.confidence } : {}),
        },
      };
    },

    carrier_directory: async (args, caller) => {
      const limit = clampLimit(args.limit, MCP_MAX_ROWS);
      const captured = await get(handlers.insuranceCompanies, { q: args.q, limit }, caller);
      if (!ok(captured)) return failed('carrier_directory', captured);
      return { ok: true, data: rows(captured.body, CARRIER_FIELDS, Number(limit)) };
    },

    carrier_learnings: async (args, caller) => {
      const limit = clampLimit(args.limit, MCP_LEARNING_MAX_ROWS);
      const captured = await get(handlers.learningGlobal, { insurer: args.insurer, limit }, caller);
      if (!ok(captured)) return failed('carrier_learnings', captured);
      return { ok: true, data: rows(pick(captured.body, ['learnings'])?.learnings, LEARNING_FIELDS, Number(limit)) };
    },

    adjuster_learnings: async (args, caller) => {
      const limit = clampLimit(args.limit, MCP_LEARNING_MAX_ROWS);
      const captured = await get(handlers.learningGlobal, { adjuster: args.adjuster, limit }, caller);
      if (!ok(captured)) return failed('adjuster_learnings', captured);
      return { ok: true, data: rows(pick(captured.body, ['learnings'])?.learnings, LEARNING_FIELDS, Number(limit)) };
    },

    rep_directory: async (args, caller) => {
      // The schema already requires q (min 2 chars); this is the executor's own
      // refusal so the roster can never be handed out through a schema change.
      const needle = String(args.q ?? '').trim().toLowerCase();
      if (needle.length < 2) return { ok: false, data: null, error: 'rep_directory needs a search string of at least 2 characters.' };
      const captured = await get(handlers.team, {}, caller);
      if (!ok(captured)) return failed('rep_directory', captured);
      const users = pick(captured.body, ['users'])?.users;
      return {
        ok: true,
        data: rows(users, REP_FIELDS, MCP_REP_MAX_ROWS, (row) =>
          [row.name, row.email, row.username].some((value) => typeof value === 'string' && value.toLowerCase().includes(needle))),
      };
    },
  };
}
