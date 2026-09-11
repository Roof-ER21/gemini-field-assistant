/**
 * Roof HR's tools, offered to Gemini as Susan's own.
 *
 * Susan's sixteen tools are Gemini `FunctionDeclaration`s built in process.
 * Roof HR's twelve are MCP tools behind an HTTP endpoint, described with JSON
 * Schema. This file is the seam: it fetches Roof HR's tool list on the REP'S
 * OWN token, rewrites each schema into the OpenAPI subset Gemini accepts, and
 * hands back a dispatcher that turns a Gemini function call into a `tools/call`.
 *
 * Three rules this file enforces, each of which is the whole point:
 *
 *   1. **No shared token, ever.** If this rep has no connection of their own,
 *      no Roof HR tool is offered at all and Susan is told, in the prompt, to
 *      say she cannot see Roof HR yet. The token sitting on Roof HR prod today
 *      belongs to a System Administrator; a fallback would hand every rep an
 *      admin's view of the company. "I can't see that yet" is the correct answer.
 *
 *   2. **A verified session is required.** sa21 still accepts an asserted
 *      `x-user-email` in Stage 1 (server/auth/session.ts). If reading Roof HR
 *      worked for such a caller, the header hole would become a way to read a
 *      named rep's HR record — worse than anything it reaches inside sa21. So
 *      this is gated exactly like the outward-action tools.
 *
 *   3. **Roof HR decides what the answer is.** Nothing here re-implements a
 *      permission. A rep asking about someone else's PTO gets Roof HR's own
 *      refusal, relayed verbatim.
 */

import { Type, type FunctionDeclaration, type Schema } from '@google/genai';
import type pg from 'pg';
import {
  callTool,
  listTools,
  resultText,
  McpError,
  type McpToolDefinition,
} from './mcpClient.js';
import {
  deleteConnection,
  encryptionConfigured,
  getConnection,
  touchConnection,
} from './roofhrConnection.js';
import { CONNECTED_APPS, appAllowsEmail, findConnectedApp, type ConnectedApp } from './connectedApps.js';
import crypto from 'crypto';

/** Kept for the tests and for anything still naming Roof HR's prefix directly. */
export const ROOFHR_TOOL_PREFIX = 'roofhr_';

/** A tool list is the same for a given token until the rep's role changes. Minutes, not hours. */
const TOOL_CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHED_TOOL_LISTS = 200;

const toolCache = new Map<string, { tools: McpToolDefinition[]; at: number }>();

function cacheKey(endpoint: string, token: string): string {
  return crypto.createHash('sha256').update(`${endpoint}\n${token}`).digest('hex');
}

async function cachedListTools(endpoint: string, token: string): Promise<McpToolDefinition[]> {
  const key = cacheKey(endpoint, token);
  const hit = toolCache.get(key);
  if (hit && Date.now() - hit.at < TOOL_CACHE_TTL_MS) return hit.tools;
  const tools = await listTools(endpoint, token);
  if (toolCache.size >= MAX_CACHED_TOOL_LISTS) {
    const oldest = [...toolCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) toolCache.delete(oldest[0]);
  }
  toolCache.set(key, { tools, at: Date.now() });
  return tools;
}

export function clearToolCache(): void {
  toolCache.clear();
}

// ---------------------------------------------------------------------------
// JSON Schema -> Gemini Schema
// ---------------------------------------------------------------------------

const TYPE_MAP: Record<string, Type> = {
  object: Type.OBJECT,
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
};

/**
 * Gemini takes an OpenAPI subset, not full JSON Schema, and rejects a request
 * outright when it meets a keyword it does not know — `additionalProperties`,
 * which `@omj21/mcp21` adds to every tool schema, is one of them. So this
 * translates by ALLOW-LIST: anything not understood is dropped rather than
 * passed through and risking a 400 that would take Susan's whole turn down.
 *
 * A dropped constraint costs a little validation on the way out; the server
 * re-validates every argument against the real schema anyway, so the refusal
 * still happens, just one hop later and in Roof HR's own words.
 */
export function toGeminiSchema(input: unknown): Schema | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const src = input as Record<string, unknown>;

  const declared = typeof src.type === 'string' ? src.type.toLowerCase() : undefined;
  const mapped = declared ? TYPE_MAP[declared] : undefined;
  // A schema with no usable type but with properties is an object in all but name.
  const type = mapped ?? (src.properties ? Type.OBJECT : undefined);
  if (!type) return undefined;

  const out: Schema = { type };

  if (typeof src.description === 'string' && src.description.length > 0) {
    out.description = src.description;
  }
  if (Array.isArray(src.enum)) {
    const values = src.enum.filter((v): v is string => typeof v === 'string');
    // Gemini only understands an enum on a string; on anything else it is noise.
    if (values.length > 0 && type === Type.STRING) out.enum = values;
  }
  if (type === Type.ARRAY) {
    const items = toGeminiSchema(src.items);
    // An array with no item schema is not something Gemini will accept.
    out.items = items ?? { type: Type.STRING };
  }
  if (type === Type.OBJECT && src.properties && typeof src.properties === 'object') {
    const props: Record<string, Schema> = {};
    for (const [name, raw] of Object.entries(src.properties as Record<string, unknown>)) {
      const child = toGeminiSchema(raw);
      if (child) props[name] = child;
    }
    out.properties = props;
    const required = Array.isArray(src.required)
      ? src.required.filter((r): r is string => typeof r === 'string' && r in props)
      : [];
    if (required.length > 0) out.required = required;
  }

  return out;
}

/** `pto` -> `roofhr_pto`. Gemini function names allow letters, digits and underscores. */
export function prefixedName(toolName: string, prefix: string = ROOFHR_TOOL_PREFIX): string {
  return `${prefix}${toolName}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 63);
}

export function declarationFor(
  tool: McpToolDefinition,
  app?: { toolPrefix: string; displayName: string },
): FunctionDeclaration | null {
  const prefix = app?.toolPrefix ?? ROOFHR_TOOL_PREFIX;
  const label = app?.displayName ?? 'Roof HR';
  const name = prefixedName(tool.name, prefix);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  const parameters = toGeminiSchema(tool.inputSchema);
  const decl: FunctionDeclaration = {
    name,
    description:
      `[${label} — reads this rep's own data as them] ${tool.description ?? ''}`.trim(),
  };
  // A tool that takes no arguments is declared with no parameters at all; an
  // empty OBJECT with no properties is rejected by the API.
  if (parameters && (parameters.type !== Type.OBJECT || Object.keys(parameters.properties ?? {}).length > 0)) {
    decl.parameters = parameters;
  }
  return decl;
}

// ---------------------------------------------------------------------------
// The bridge
// ---------------------------------------------------------------------------

export type RoofhrBridge = {
  declarations: FunctionDeclaration[];
  handles(name: string): boolean;
  call(name: string, args: Record<string, unknown>): Promise<{ name: string; result: Record<string, unknown> }>;
};

export type RoofhrAvailability =
  | { state: 'connected'; bridge: RoofhrBridge; promptBlock: string }
  | { state: 'unverified' | 'unconfigured' | 'not_connected' | 'unreachable' | 'not_allowed'; promptBlock: string };

const ROOFHR = findConnectedApp('roofhr')!;

/**
 * The prompt block for "no, and here is why".
 *
 * "I can't see that yet" is a real answer and has to be delivered as carefully
 * as an answer from data — a guess here is worse than a refusal, because the
 * rep cannot tell the difference.
 */
function cannotSee(app: ConnectedApp, reason: string, connectUrl?: string | null): string {
  return (
    `\n\n[${app.displayName.toUpperCase()} — NOT AVAILABLE]\n` +
    `You cannot read this rep's ${app.noun} data right now: ${reason}\n` +
    `If they ask about anything in ${app.noun}, say plainly that you cannot see it for them yet and ` +
    `point them at ${app.connectHint}. ` +
    'Never guess an answer, never state a number or a date from memory, and never say you checked. ' +
    `You have no other way into ${app.noun} — there is no shared login you can use instead.` +
    (connectUrl
      ? '\nIf they want to connect now, give them this link exactly as written — it is theirs, and it ' +
        `works for ten minutes: ${connectUrl}`
      : '')
  );
}

/**
 * What can Susan reach in Roof HR for THIS rep, on THIS request?
 *
 * Returns either a live bridge or the reason there is none, phrased for the
 * system prompt — because "I can't see that yet" is a real answer and has to be
 * delivered as well as an answer from data.
 */
export async function resolveApp(
  pool: pg.Pool,
  input: { userId: string; hasVerifiedSession: boolean; connectUrl?: string | null; allowed?: boolean },
  app: ConnectedApp = ROOFHR,
): Promise<RoofhrAvailability> {
  // Checked first: a stored connection for someone the app is not open to is never used,
  // and no connect link or button hint is offered.
  if (input.allowed === false) {
    return {
      state: 'not_allowed',
      promptBlock:
        `\n\n[${app.displayName.toUpperCase()} — NOT AVAILABLE]\n` +
        `${app.noun} is not open to this rep through Susan yet. If they ask about anything in it, say plainly ` +
        'that you cannot see it for them, and do not offer a way to connect. Never guess an answer.',
    };
  }
  if (!encryptionConfigured()) {
    // Nothing can be stored, so nothing can be read. Ships inert by design.
    return { state: 'unconfigured', promptBlock: cannotSee(app, `the ${app.displayName} connection is not switched on yet.`) };
  }

  if (input.hasVerifiedSession !== true) {
    return {
      state: 'unverified',
      promptBlock: cannotSee(
        app,
        'this request did not arrive on a verified sign-in, and their data is only read for a rep who is ' +
        'definitely signed in. Tell them to sign in again with Continue with Google.',
      ),
    };
  }

  const conn = await getConnection(pool, input.userId, app.slug);
  if (!conn) {
    return {
      state: 'not_connected',
      promptBlock: cannotSee(app, `they have not connected their ${app.displayName} account to Susan yet.`, input.connectUrl),
    };
  }

  let tools: McpToolDefinition[];
  try {
    tools = await cachedListTools(conn.endpoint, conn.token);
  } catch (err) {
    if (err instanceof McpError && (err.code === 401 || err.code === 403)) {
      // The grant is gone on Roof HR's side. Drop the row so the rep is told to
      // reconnect instead of being shown a connection that no longer works.
      await deleteConnection(pool, input.userId, app.slug);
      return {
        state: 'not_connected',
        promptBlock: cannotSee(
          app,
          `${app.displayName} no longer accepts their connection; they need to reconnect at ${app.connectHint}.`,
          input.connectUrl,
        ),
      };
    }
    console.error(`[connected-tools] ${app.slug} tools/list failed:`, (err as Error).message);
    return { state: 'unreachable', promptBlock: cannotSee(app, `${app.displayName} is not answering right now.`) };
  }

  const declarations: FunctionDeclaration[] = [];
  const byPrefixed = new Map<string, string>();
  for (const tool of tools) {
    const decl = declarationFor(tool, app);
    if (!decl) continue;
    declarations.push(decl);
    byPrefixed.set(decl.name!, tool.name);
  }

  if (declarations.length === 0) {
    return { state: 'unreachable', promptBlock: cannotSee(app, `${app.displayName} offered no tools this connection can use.`) };
  }

  const bridge: RoofhrBridge = {
    declarations,
    handles: (name) => byPrefixed.has(name),
    call: async (name, args) => {
      const remoteName = byPrefixed.get(name);
      if (!remoteName) {
        return { name, result: { success: false, error: `Unknown ${app.displayName} tool "${name}".` } };
      }
      try {
        const result = await callTool(conn.endpoint, conn.token, remoteName, args ?? {});
        touchConnection(pool, input.userId, app.slug);
        const text = resultText(result);
        if (result.isError === true) {
          // The peer's own refusal, relayed as written. Its wording is the answer.
          return { name, result: { success: false, error: text || `${app.displayName} refused that request.` } };
        }
        return {
          name,
          result: {
            success: true,
            source: app.slug,
            ...(result.structuredContent ? { data: result.structuredContent } : {}),
            ...(text ? { text } : {}),
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof McpError && (err.code === 401 || err.code === 403)) {
          await deleteConnection(pool, input.userId, app.slug);
        }
        console.error(`[connected-tools] ${app.slug} ${remoteName} failed:`, message);
        return { name, result: { success: false, error: message } };
      }
    },
  };

  const names = declarations.map((d) => d.name).join(', ');
  const promptBlock =
    `\n\n[${app.displayName.toUpperCase()} — CONNECTED]\n` +
    `This rep has connected their own ${app.noun} account, so the ${app.toolPrefix}* tools (${names}) ` +
    `read ${app.noun} AS THEM, with their own permissions. Scopes granted: ` +
    `${conn.scopes.join(', ') || 'none'}. Use these tools for anything in ${app.noun} — never answer ` +
    'from memory. If a tool comes back with a refusal, relay it as written: that is ' +
    `${app.displayName} saying this rep may not see that, and it is correct.`;

  return { state: 'connected', bridge, promptBlock };
}

/** Kept so existing callers and tests can ask about Roof HR by name. */
export async function resolveRoofhr(
  pool: pg.Pool,
  input: { userId: string; hasVerifiedSession: boolean; connectUrl?: string | null },
): Promise<RoofhrAvailability> {
  return resolveApp(pool, input, ROOFHR);
}

export type ConnectedTools = {
  declarations: FunctionDeclaration[];
  handles(name: string): boolean;
  call(name: string, args: Record<string, unknown>): Promise<{ name: string; result: Record<string, unknown> }>;
  /** Everything Susan needs told about every peer, connected or not. */
  promptBlock: string;
  /** For the log line: which peers ended up in which state. */
  states: Record<string, string>;
};

/**
 * Every peer at once.
 *
 * Resolved per request because what is on offer depends entirely on who is
 * asking: two reps on the same server get different toolsets, and a rep with no
 * connections gets none at all plus the sentences that tell Susan to say so.
 */
export async function resolveConnectedApps(
  pool: pg.Pool,
  input: {
    userId: string;
    hasVerifiedSession: boolean;
    connectUrlFor?: (app: ConnectedApp) => string | null;
    /** The verified session email, or null. Decides per-app allowlists. */
    userEmail?: string | null;
  },
): Promise<ConnectedTools> {
  const resolved = await Promise.all(
    CONNECTED_APPS.map(async (app) => {
      const allowed = appAllowsEmail(app, input.hasVerifiedSession ? input.userEmail : null);
      return {
      app,
      availability: await resolveApp(
        pool,
        {
          userId: input.userId,
          hasVerifiedSession: input.hasVerifiedSession,
          connectUrl: allowed ? input.connectUrlFor?.(app) ?? null : null,
          allowed,
        },
        app,
      ),
      };
    }),
  );

  const bridges = resolved
    .map((r) => (r.availability.state === 'connected' ? r.availability.bridge : null))
    .filter((b): b is RoofhrBridge => b !== null);

  return {
    declarations: bridges.flatMap((b) => b.declarations),
    handles: (name) => bridges.some((b) => b.handles(name)),
    call: async (name, args) => {
      const bridge = bridges.find((b) => b.handles(name));
      if (!bridge) return { name, result: { success: false, error: `No connected app owns the tool "${name}".` } };
      return bridge.call(name, args);
    },
    promptBlock: resolved.map((r) => r.availability.promptBlock).join(''),
    states: Object.fromEntries(resolved.map((r) => [r.app.slug, r.availability.state])),
  };
}
