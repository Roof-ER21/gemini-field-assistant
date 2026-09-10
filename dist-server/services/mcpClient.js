/**
 * A small MCP client.
 *
 * MCP (Model Context Protocol) is a wire format for "here are my tools, call
 * one": JSON-RPC 2.0 over a single HTTP POST, with `tools/list` and `tools/call`
 * as the two methods that matter here. Susan has never had one — her sixteen
 * tools are Gemini `FunctionDeclaration`s defined in process — so this is how
 * she reaches a tool that lives in another app.
 *
 * Why hand-written rather than `@modelcontextprotocol/sdk`: the servers it
 * talks to (Roof HR, CC24, Lite Training — all built on `@omj21/mcp21`) run the
 * Streamable HTTP transport STATELESS, with no session id and no resumable
 * stream. The SDK's client transport exists to manage exactly those things.
 * What is actually needed is one POST, one response, verified against prod:
 *
 *   - `Accept: application/json, text/event-stream` is MANDATORY — without both
 *     the server answers 406 before looking at the body.
 *   - The reply comes back as `text/event-stream` with a single `data:` line,
 *     even though the request is a one-shot. JSON is handled too, in case a
 *     server is configured with `enableJsonResponse`.
 *
 * Two safety properties this file is responsible for, because it carries a
 * bearer token for a real person:
 *   - Redirects are NEVER followed. A 30x to another host would otherwise hand
 *     someone else's server the rep's Roof HR token.
 *   - The response body is capped and the request is time-bounded, so a slow or
 *     endless stream cannot hold a rep's chat turn open.
 */
/** Long enough for a cold container, short enough that a chat turn still answers. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Tool results are reports, not payloads. A megabyte is already far past useful. */
const MAX_RESPONSE_BYTES = 1_000_000;
export class McpError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = 'McpError';
        this.code = code;
    }
}
let requestId = 0;
/** Pull the JSON-RPC envelope out of an SSE body: the frames are `data: {...}` lines. */
function parseSse(body) {
    let last = null;
    for (const rawLine of body.split(/\r?\n/)) {
        if (!rawLine.startsWith('data:'))
            continue;
        const payload = rawLine.slice(5).trim();
        if (!payload || payload === '[DONE]')
            continue;
        try {
            last = JSON.parse(payload);
        }
        catch {
            // A partial frame is not fatal on its own; a later complete one may follow.
        }
    }
    return last;
}
async function readCapped(response) {
    const reader = response.body?.getReader();
    if (!reader)
        return await response.text();
    const decoder = new TextDecoder();
    let out = '';
    let bytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
            await reader.cancel().catch(() => { });
            throw new McpError('That tool returned more data than Susan can read.');
        }
        out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
}
/** One JSON-RPC round trip. Throws McpError on a transport, protocol or tool-level failure. */
export async function mcpCall(endpoint, token, method, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            // A token must not travel to wherever a redirect points.
            redirect: 'manual',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                // Both, or the server answers 406 before reading the body.
                Accept: 'application/json, text/event-stream',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, ...(params ? { params } : {}) }),
        });
    }
    catch (err) {
        const message = err.name === 'AbortError'
            ? 'Roof HR did not answer in time.'
            : `Could not reach Roof HR: ${err.message}`;
        throw new McpError(message);
    }
    finally {
        clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
        throw new McpError('Roof HR answered with a redirect; Susan will not send a token onward.');
    }
    if (response.status === 401 || response.status === 403) {
        throw new McpError('Roof HR no longer accepts this connection. Reconnect Roof HR and try again.', response.status);
    }
    const body = await readCapped(response);
    const contentType = response.headers.get('content-type') ?? '';
    const envelope = contentType.includes('text/event-stream')
        ? parseSse(body)
        : (() => { try {
            return JSON.parse(body);
        }
        catch {
            return null;
        } })();
    if (!envelope || typeof envelope !== 'object') {
        throw new McpError(`Roof HR returned something unreadable (HTTP ${response.status}).`);
    }
    const rpc = envelope;
    if (rpc.error) {
        throw new McpError(rpc.error.message || 'Roof HR refused that request.', rpc.error.code);
    }
    if (rpc.result === undefined) {
        if (!response.ok)
            throw new McpError(`Roof HR returned HTTP ${response.status}.`);
        throw new McpError('Roof HR returned an empty result.');
    }
    return rpc.result;
}
export async function listTools(endpoint, token) {
    const result = await mcpCall(endpoint, token, 'tools/list');
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.filter((t) => typeof t?.name === 'string' && t.name.length > 0);
}
export async function callTool(endpoint, token, name, args) {
    return await mcpCall(endpoint, token, 'tools/call', { name, arguments: args });
}
/** Flatten an MCP result's text blocks into the one string a Gemini tool response carries. */
export function resultText(result) {
    const blocks = Array.isArray(result.content) ? result.content : [];
    return blocks
        .map((b) => (typeof b?.text === 'string' ? b.text : ''))
        .filter((t) => t.length > 0)
        .join('\n');
}
