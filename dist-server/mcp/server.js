/**
 * sa21 MCP server — JSON-RPC 2.0 over Streamable HTTP, POST only, pinned to
 * protocol version 2025-06-18. Hand-rolled: @modelcontextprotocol/sdk is not a
 * dependency of this repo (only an optional peer of one), and the shape here
 * mirrors RIQ21's server/mcp/server.ts and Genie 21's own protocol module so
 * the three speak the same dialect:
 *
 *   • a Streamable-HTTP server that offers no standalone SSE stream answers
 *     every POST with one JSON body and answers GET with 405 (Allow: POST);
 *   • no sessions of its own (no Mcp-Session-Id) — every request carries its
 *     bearer and is authorized from scratch;
 *   • initialize / notifications/initialized / ping / tools/list / tools/call.
 *
 * Auth: the bearer on an MCP request is either
 *   • a PERSON's sa21 session token (`s21_…`), resolved by the same
 *     `createSessionMiddleware` that fronts every /api route
 *     (server/auth/session.ts) — unchanged; or
 *   • a personal AGENT token (`s21a_…`, server/auth/agentTokens.ts) the rep
 *     minted in Settings → Connected agents. It is read-only: tools/list shows
 *     only the tools `agentMayCallTool` allows, and any other tools/call is a
 *     403. Each agent tools/call is audited (argument keys, never values).
 * A legacy `x-user-email` header is never an identity here, in either rollout
 * stage. No credential is a 401 with WWW-Authenticate, never an empty tool
 * list. Every read runs AS the person who owns the credential.
 *
 * Host: the endpoint lives on the rep host only. A request that arrived on
 * the homeowner domain (get.theroofdocs.com) is a 404, decided by the same
 * `hitGetDomain` check the rep login uses (injected from server/index.ts).
 *
 * Origin: a browser always sends Origin on a cross-site POST, so a foreign
 * Origin is refused (DNS-rebinding guard) unless it is one of the app's own
 * origins (the CORS allowlist, injected). Non-browser MCP clients (Claude
 * Code, Genie's reader) send none — allowed. localhost is allowed.
 *
 * Tools: exactly the five read tools Genie's ask_susan skill expects
 * (genie21 src/lib/susan/tools.ts). Each runs the SAME in-process handler the
 * REST route uses (executors.ts) — no loopback fetch.
 *
 * This module has no DB import on purpose: the protocol layer is testable
 * with fake executors (test/mcp/mcp-server.test.ts).
 */
import express from 'express';
import { agentBearerFrom, agentMayCallTool, } from '../auth/agentTokens.js';
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_NAME = 'sa21';
export const MCP_SERVER_VERSION = '1.0.0';
/** JSON-RPC 2.0 standard codes, plus the SDK's connection-level code. */
export const JSON_RPC = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    CONNECTION_REFUSED: -32000,
};
/** Genie bounds a lookup query at 120 chars and an `ask` message at 400 (SUSAN_QUERY_MAX_CHARS / SUSAN_ASK_MAX_CHARS). */
export const MCP_ARG_MAX_CHARS = 120;
export const MCP_ASK_MAX_CHARS = 400;
// ─── Tool catalog ──────────────────────────────────────────────────────────
/** The five tool names, in the order tools/list returns them. Same ids as Genie's SUSAN_TOOLS. */
export const MCP_TOOL_NAMES = [
    'ask',
    'carrier_directory',
    'carrier_learnings',
    'adjuster_learnings',
    'rep_directory',
];
const strProp = (description, minLength = 1, maxLength = MCP_ARG_MAX_CHARS) => ({ type: 'string', description, minLength, maxLength });
/** A row cap sent as a string, like every other argument: 1–2 digits, bounded again in the executor. */
const limitProp = (max) => ({ type: 'string', description: `Optional row cap, "1" to "${max}" (default "${max}").`, minLength: 1, maxLength: 2, pattern: '^[0-9]{1,2}$' });
/** Strict input schemas: only string params, each bounded, no extras. */
const INPUT_SCHEMAS = {
    ask: {
        type: 'object',
        properties: { message: strProp('One roofing or insurance question for Susan, in plain words.', 2, MCP_ASK_MAX_CHARS) },
        required: ['message'],
        additionalProperties: false,
    },
    carrier_directory: {
        type: 'object',
        properties: {
            q: strProp('Part of the carrier\'s name, e.g. "State Farm".', 2),
            limit: limitProp(25),
        },
        required: ['q'],
        additionalProperties: false,
    },
    carrier_learnings: {
        type: 'object',
        properties: {
            insurer: strProp('The carrier\'s exact name as the team records it.', 2),
            limit: limitProp(20),
        },
        required: ['insurer'],
        additionalProperties: false,
    },
    adjuster_learnings: {
        type: 'object',
        properties: {
            adjuster: strProp('The adjuster\'s exact name as the team records it.', 2),
            limit: limitProp(20),
        },
        required: ['adjuster'],
        additionalProperties: false,
    },
    rep_directory: {
        type: 'object',
        properties: { q: strProp('Part of the rep\'s name, email or username (case-insensitive). Required: this tool never lists the whole roster.', 2) },
        required: ['q'],
        additionalProperties: false,
    },
};
const DESCRIPTIONS = {
    ask: 'Susan\'s own answer to one roofing or insurance question, in her voice. MODEL CALL: this runs sa21\'s Gemini model and spends its quota on every call; ' +
        'without a presentation session it is her general knowledge, not the team knowledge base. Prefer the directory and learnings tools for facts.',
    carrier_directory: 'An insurance carrier\'s phone, email, address, website and the team\'s notes on it, from sa21\'s carrier directory (the query is part of the carrier\'s name).',
    carrier_learnings: 'What the team has learned about one carrier: approved, reusable learnings scoped to that insurer, most helpful first (the query is the carrier\'s exact name).',
    adjuster_learnings: 'What the team has learned about one adjuster: approved learnings scoped to that adjuster\'s name, most helpful first (the query is the adjuster\'s exact name).',
    rep_directory: 'A rep\'s name, email and username from sa21\'s team roster, narrowed by a required search string (at most 10 rows). Never the whole roster.',
};
export const MCP_TOOLS = MCP_TOOL_NAMES.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: INPUT_SCHEMAS[name],
    // `ask` reads nothing and writes nothing, but it is a model call: not
    // idempotent (a new answer each time) and open-world (Gemini).
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: name !== 'ask', openWorldHint: name === 'ask' },
}));
function rpcError(id, code, message, data) {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}
function rpcResult(id, result) {
    return { jsonrpc: '2.0', id, result };
}
function send(res, body, status = 200, headers = {}) {
    res.status(status);
    res.setHeader('Cache-Control', 'private, no-store');
    for (const [k, v] of Object.entries(headers))
        res.setHeader(k, v);
    res.json(body);
}
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
/** Returns the refusal, or null when the request's Origin may pass. */
export function originRefusal(req, originAllowed) {
    const origin = req.header('origin');
    if (origin == null)
        return null;
    if (LOCAL_ORIGIN.test(origin))
        return null;
    if (originAllowed(origin))
        return null;
    return 'The request origin is not allowed.';
}
function unauthorized(res) {
    send(res, rpcError(null, JSON_RPC.CONNECTION_REFUSED, 'A signed-in sa21 session or an sa21 agent token is required.'), 401, {
        'WWW-Authenticate': 'Bearer realm="sa21-mcp", error="invalid_token"',
    });
}
/** Express handler for GET (and any other non-POST) on /mcp. */
export function mcpMethodNotAllowed(_req, res) {
    send(res, rpcError(null, JSON_RPC.CONNECTION_REFUSED, 'Method not allowed. This MCP server accepts POST only.'), 405, { Allow: 'POST' });
}
/**
 * Express error middleware for /mcp: a body express.json() could not parse
 * becomes a JSON-RPC parse error instead of Express's HTML 400 page.
 */
export function mcpParseErrorHandler(err, _req, res, next) {
    const e = err;
    if (e && (e.type === 'entity.parse.failed' || e.type === 'entity.too.large')) {
        send(res, rpcError(null, JSON_RPC.PARSE_ERROR, 'Parse error.'), 400);
        return;
    }
    next(err);
}
/** True when the string carries a newline or any other C0/DEL control character. */
function hasControlChar(value) {
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c < 0x20 || c === 0x7f)
            return true;
    }
    return false;
}
/**
 * Validate tools/call arguments against the tool's strict schema. Returns the
 * cleaned string args, or the reason they were refused (→ -32602).
 */
export function validateArgs(name, raw) {
    const schema = INPUT_SCHEMAS[name];
    const input = raw === undefined ? {} : raw;
    if (typeof input !== 'object' || input === null || Array.isArray(input))
        return { ok: false, reason: 'arguments must be an object.' };
    const args = {};
    for (const [key, value] of Object.entries(input)) {
        const prop = schema.properties[key];
        if (!prop)
            return { ok: false, reason: `Unknown argument: ${key.slice(0, 40)}` };
        if (typeof value !== 'string')
            return { ok: false, reason: `${key} must be a string.` };
        if (hasControlChar(value))
            return { ok: false, reason: `${key} must be one line.` };
        const cleaned = value.replace(/\s+/g, ' ').trim();
        if (cleaned.length > prop.maxLength)
            return { ok: false, reason: `${key} is longer than ${prop.maxLength} characters.` };
        if (cleaned.length === 0)
            continue; // an empty optional is the same as absent
        if (cleaned.length < (prop.minLength ?? 0))
            return { ok: false, reason: `${key} is too short.` };
        if (prop.pattern && !new RegExp(prop.pattern).test(cleaned))
            return { ok: false, reason: `${key} is not in the expected form.` };
        args[key] = cleaned;
    }
    for (const required of schema.required) {
        if (!(required in args))
            return { ok: false, reason: `${required} is required.` };
    }
    return { ok: true, args };
}
/** Bound what one tool result may carry back (Genie caps at 48k chars anyway). */
export const MCP_RESULT_MAX_CHARS = 400_000;
function toolResult(result) {
    if (!result.ok) {
        return { content: [{ type: 'text', text: result.error ?? 'The tool could not answer.' }], isError: true };
    }
    let text;
    try {
        text = JSON.stringify(result.data ?? null);
    }
    catch {
        text = String(result.data);
    }
    if (text.length > MCP_RESULT_MAX_CHARS) {
        text = text.slice(0, MCP_RESULT_MAX_CHARS) + `\n[TRUNCATED: result exceeded ${MCP_RESULT_MAX_CHARS} characters; narrow the query.]`;
    }
    return { content: [{ type: 'text', text }], isError: false };
}
/**
 * Build the POST /mcp handler. The order of checks is the order a caller
 * learns things: host, origin, protocol version, session, then the body — a
 * caller without a session learns nothing about the body and nothing about
 * the tool list.
 */
export function createMcpHandler(options) {
    const { executors, originAllowed } = options;
    return async function mcpPost(req, res) {
        const origin = originRefusal(req, originAllowed);
        if (origin) {
            send(res, rpcError(null, JSON_RPC.CONNECTION_REFUSED, origin), 403);
            return;
        }
        // The client states the negotiated version on every request after
        // initialize. Absent means "the version initialize agreed", which is the
        // one we pin; anything else is a version this server does not speak.
        const stated = req.header('mcp-protocol-version');
        if (stated != null && stated !== MCP_PROTOCOL_VERSION) {
            send(res, rpcError(null, JSON_RPC.CONNECTION_REFUSED, `Unsupported protocol version: ${String(stated).slice(0, 40)}. This server speaks ${MCP_PROTOCOL_VERSION}.`), 400);
            return;
        }
        // Identity: a session resolved by the front-door middleware, or an agent
        // token resolved by the router. The legacy header is not an identity for
        // MCP, in either rollout stage.
        const identified = req;
        const agent = identified.authMechanism === 'agent-token' ? identified.agent : undefined;
        let caller;
        if (identified.session && identified.authMechanism === 'session') {
            caller = { userId: identified.session.userId, email: identified.session.email };
        }
        else if (agent) {
            caller = { userId: agent.userId, email: agent.email };
        }
        else {
            unauthorized(res);
            return;
        }
        const message = req.body;
        if (Array.isArray(message)) {
            send(res, rpcError(null, JSON_RPC.INVALID_REQUEST, 'Batches are not part of protocol 2025-06-18.'), 400);
            return;
        }
        if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
            send(res, rpcError(null, JSON_RPC.INVALID_REQUEST, 'Invalid request.'), 400);
            return;
        }
        const { id: rawId, method, params } = message;
        const hasId = rawId !== undefined;
        const id = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null;
        // Notifications carry no id and get no body: 202 Accepted.
        if (!hasId) {
            if (method.startsWith('notifications/')) {
                res.status(202);
                res.setHeader('Cache-Control', 'private, no-store');
                res.end();
                return;
            }
            send(res, rpcError(null, JSON_RPC.INVALID_REQUEST, 'A request needs an id.'), 400);
            return;
        }
        if (method === 'initialize') {
            send(res, rpcResult(id, {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
                instructions: 'Susan (sa21) read tools for Roof-ER reps: the carrier directory, the team\'s carrier and adjuster learnings, a rep lookup, and Susan\'s own answer to a question. ' +
                    'Every read is made as the rep who owns the credential on this connection (their session, or a read-only agent token they minted). `ask` runs a model and spends quota; prefer the directory and learnings tools for facts.',
            }));
            return;
        }
        if (method === 'ping') {
            send(res, rpcResult(id, {}));
            return;
        }
        if (method === 'tools/list') {
            // An agent token sees only what it may call.
            const tools = agent ? MCP_TOOLS.filter((tool) => agentMayCallTool(agent, tool)) : MCP_TOOLS;
            send(res, rpcResult(id, { tools }));
            return;
        }
        if (method === 'tools/call') {
            const call = params;
            if (!call || typeof call.name !== 'string') {
                send(res, rpcError(id, JSON_RPC.INVALID_PARAMS, 'tools/call needs a tool name.'));
                return;
            }
            const name = call.name;
            if (!MCP_TOOL_NAMES.includes(name)) {
                send(res, rpcError(id, JSON_RPC.INVALID_PARAMS, `Unknown tool: ${name.slice(0, 80)}`));
                return;
            }
            const argumentKeys = call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
                ? Object.keys(call.arguments)
                : [];
            const started = Date.now();
            const audit = (outcome, error) => {
                if (!agent)
                    return;
                try {
                    options.agentAuth?.onToolUse?.({
                        tokenId: agent.tokenId, userId: agent.userId, tool: name, argumentKeys, outcome, error, durationMs: Date.now() - started,
                    });
                }
                catch { /* auditing never fails the call */ }
            };
            // The read-only scope guard: before arguments are even looked at.
            if (agent && !agentMayCallTool(agent, MCP_TOOLS.find((tool) => tool.name === name))) {
                audit('refused', 'outside the agent token scope');
                send(res, rpcError(id, JSON_RPC.CONNECTION_REFUSED, `This agent token is read-only; ${name.slice(0, 80)} is not available to it.`), 403);
                return;
            }
            const validated = validateArgs(name, call.arguments);
            if (validated.ok === false) {
                audit('error', 'invalid arguments');
                send(res, rpcError(id, JSON_RPC.INVALID_PARAMS, validated.reason));
                return;
            }
            let result;
            try {
                result = await executors[name](validated.args, caller);
            }
            catch (err) {
                // Never leak a stack, a hostname or a SQL fragment to the client.
                console.warn(`[mcp] ${name} threw:`, err instanceof Error ? err.message : err);
                result = { ok: false, data: null, error: `${name} could not answer right now.` };
            }
            audit(result.ok ? 'ok' : 'error', result.ok ? undefined : result.error);
            send(res, rpcResult(id, toolResult(result)));
            return;
        }
        send(res, rpcError(id, JSON_RPC.METHOD_NOT_FOUND, `Method not found: ${method.slice(0, 80)}`));
    };
}
/** An MCP request is one JSON-RPC message; a 400-char question fits in a few KB. */
export const MCP_BODY_LIMIT = '64kb';
/**
 * The router server/index.ts mounts at /mcp, BEFORE the app-wide body parser
 * and session middleware (see McpServerOptions.sessionMiddleware). Host
 * gating comes first so the homeowner domain never even reveals that an MCP
 * endpoint exists; the method check comes before any body is read.
 */
export function createMcpRouter(options) {
    const router = express.Router();
    const post = createMcpHandler(options);
    router.use((req, res, next) => {
        if (options.isHomeownerHost(req)) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        if (req.path !== '/') {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        if (req.method !== 'POST') {
            mcpMethodNotAllowed(req, res);
            return;
        }
        next();
    });
    router.use(express.json({ limit: MCP_BODY_LIMIT, type: () => true }));
    router.use(mcpParseErrorHandler);
    // An agent token takes its own path and never touches the session store; a
    // session bearer (or no bearer) goes through the session middleware exactly
    // as before agent tokens existed.
    router.use((req, res, next) => {
        const agentToken = options.agentAuth ? agentBearerFrom(req) : null;
        if (!agentToken || !options.agentAuth) {
            Promise.resolve(options.sessionMiddleware(req, res, next)).catch(next);
            return;
        }
        options.agentAuth.resolve(agentToken).then((principal) => {
            if (!principal) {
                unauthorized(res);
                return;
            }
            req.agent = principal;
            req.authMechanism = 'agent-token';
            next();
        }).catch(next);
    });
    router.post('/', (req, res, next) => { post(req, res).catch(next); });
    return router;
}
