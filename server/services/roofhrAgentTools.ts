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
  ROOFHR_APP,
  deleteConnection,
  encryptionConfigured,
  getConnection,
  touchConnection,
} from './roofhrConnection.js';
import crypto from 'crypto';

/** Every Roof HR tool reaches Gemini under this prefix, so the two tool sets cannot collide. */
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
export function prefixedName(toolName: string): string {
  return `${ROOFHR_TOOL_PREFIX}${toolName}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 63);
}

export function declarationFor(tool: McpToolDefinition): FunctionDeclaration | null {
  const name = prefixedName(tool.name);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  const parameters = toGeminiSchema(tool.inputSchema);
  const decl: FunctionDeclaration = {
    name,
    description:
      `[Roof HR — reads this rep's own HR data as them] ${tool.description ?? ''}`.trim(),
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
  | { state: 'unverified' | 'unconfigured' | 'not_connected' | 'unreachable'; promptBlock: string };

const CONNECT_HINT = 'the "Connect Roof HR" button at the top of this chat';

function cannotSee(reason: string, connectUrl?: string | null): string {
  return (
    '\n\n[ROOF HR — NOT AVAILABLE]\n' +
    `You cannot read this rep's Roof HR data right now: ${reason}\n` +
    'If they ask about PTO, time off, their HR profile, documents or HR meetings, say plainly that you ' +
    `cannot see Roof HR for them yet and point them at ${CONNECT_HINT}. ` +
    'Never guess an answer, never state a PTO balance or a date from memory, and never say you checked. ' +
    'You have no other way into Roof HR — there is no shared login you can use instead.' +
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
export async function resolveRoofhr(
  pool: pg.Pool,
  input: { userId: string; hasVerifiedSession: boolean; connectUrl?: string | null },
): Promise<RoofhrAvailability> {
  if (!encryptionConfigured()) {
    // Nothing can be stored, so nothing can be read. Ships inert by design.
    return { state: 'unconfigured', promptBlock: cannotSee('the Roof HR connection is not switched on yet.') };
  }

  if (input.hasVerifiedSession !== true) {
    return {
      state: 'unverified',
      promptBlock: cannotSee(
        'this request did not arrive on a verified sign-in, and HR data is only read for a rep who is ' +
        'definitely signed in. Tell them to sign in again with Continue with Google.',
      ),
    };
  }

  const conn = await getConnection(pool, input.userId);
  if (!conn) {
    return {
      state: 'not_connected',
      promptBlock: cannotSee('they have not connected their Roof HR account to Susan yet.', input.connectUrl),
    };
  }

  let tools: McpToolDefinition[];
  try {
    tools = await cachedListTools(conn.endpoint, conn.token);
  } catch (err) {
    if (err instanceof McpError && (err.code === 401 || err.code === 403)) {
      // The grant is gone on Roof HR's side. Drop the row so the rep is told to
      // reconnect instead of being shown a connection that no longer works.
      await deleteConnection(pool, input.userId, ROOFHR_APP);
      return {
        state: 'not_connected',
        promptBlock: cannotSee(
          `Roof HR no longer accepts their connection; they need to reconnect at ${CONNECT_HINT}.`,
          input.connectUrl,
        ),
      };
    }
    console.error('[roofhr-tools] tools/list failed:', (err as Error).message);
    return { state: 'unreachable', promptBlock: cannotSee('Roof HR is not answering right now.') };
  }

  const declarations: FunctionDeclaration[] = [];
  const byPrefixed = new Map<string, string>();
  for (const tool of tools) {
    const decl = declarationFor(tool);
    if (!decl) continue;
    declarations.push(decl);
    byPrefixed.set(decl.name!, tool.name);
  }

  if (declarations.length === 0) {
    return { state: 'unreachable', promptBlock: cannotSee('Roof HR offered no tools this connection can use.') };
  }

  const bridge: RoofhrBridge = {
    declarations,
    handles: (name) => byPrefixed.has(name),
    call: async (name, args) => {
      const remoteName = byPrefixed.get(name);
      if (!remoteName) {
        return { name, result: { success: false, error: `Unknown Roof HR tool "${name}".` } };
      }
      try {
        const result = await callTool(conn.endpoint, conn.token, remoteName, args ?? {});
        touchConnection(pool, input.userId, ROOFHR_APP);
        const text = resultText(result);
        if (result.isError === true) {
          // Roof HR's own refusal, relayed as written. Its wording is the answer.
          return { name, result: { success: false, error: text || 'Roof HR refused that request.' } };
        }
        return {
          name,
          result: {
            success: true,
            source: 'roofhr',
            ...(result.structuredContent ? { data: result.structuredContent } : {}),
            ...(text ? { text } : {}),
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof McpError && (err.code === 401 || err.code === 403)) {
          await deleteConnection(pool, input.userId, ROOFHR_APP);
        }
        console.error(`[roofhr-tools] ${remoteName} failed:`, message);
        return { name, result: { success: false, error: message } };
      }
    },
  };

  const names = declarations.map((d) => d.name).join(', ');
  const promptBlock =
    '\n\n[ROOF HR — CONNECTED]\n' +
    `This rep has connected their own Roof HR account, so the ${ROOFHR_TOOL_PREFIX}* tools (${names}) ` +
    'read Roof HR AS THEM, with their own permissions. Scopes granted: ' +
    `${conn.scopes.join(', ') || 'none'}. Use these tools for anything about PTO, time off, their HR ` +
    'profile, HR documents or HR meetings — never answer from memory. If a tool comes back with a ' +
    'refusal, relay it as written: that is Roof HR saying this rep may not see that, and it is correct. ' +
    'Call roofhr_me first if you need their Roof HR identity or id for another tool.';

  return { state: 'connected', bridge, promptBlock };
}
