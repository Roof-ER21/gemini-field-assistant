# sa21 MCP endpoint

Susan (sa21) exposes five read tools over the Model Context Protocol so Genie 21,
Claude Code, or any MCP client can ask her what a rep would ask her, as that rep.

| | |
|---|---|
| **URL** | `https://sa21.theroofdocs.com/mcp` (locally: `http://localhost:8080/mcp`, or whatever `PORT` the server booted on) |
| **Transport** | Streamable HTTP, **POST only**, one JSON-RPC 2.0 message per request, JSON response. `GET` answers `405 Allow: POST`. No `Mcp-Session-Id`, no SSE stream. |
| **Protocol** | `2025-06-18` (pinned; any other `MCP-Protocol-Version` header is refused with 400) |
| **Auth** | `Authorization: Bearer <a rep's sa21 session token>` — see below |
| **Methods** | `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call` |
| **Code** | `server/mcp/server.ts` (protocol), `server/mcp/executors.ts` (tool → route handler), `server/mcp/shim.ts` (in-process req/res), mounted in `server/index.ts` |
| **Tests** | `npm run test:mcp` (`test/mcp/mcp-server.test.ts`) |

## The bearer is a person's session token

sa21 has no API keys and this endpoint adds none. The only credential it accepts
is a **rep's own session token** (`s21_…`), the same bearer the web app sends on
every `/api` call, minted at sign-in by `server/auth/session.ts` (24h for a
browser-only session, 365d with "remember me"). The MCP router runs the SAME
`createSessionMiddleware(pool)` the REST routes use and then requires that a
session was resolved:

- no bearer, an expired one, or an unknown one → `401` with
  `WWW-Authenticate: Bearer realm="sa21-mcp"` and a JSON-RPC error. Never an
  empty tool list.
- the legacy `x-user-email` header is **not** an identity here, in either
  rollout stage (`SA21_REQUIRE_SESSION` on or off).
- every `tools/call` runs the REST handler in-process with `x-user-email`
  rewritten to the session's address, so a read arrives **as that person** —
  exactly what Genie's `ask_susan` expects. There is no service identity, no
  owner fallback, and nothing in `server/mcp/*` reads `process.env`.

To get a token for a connection: sign in to sa21 as the rep whose reads these
should be, and take the bearer the client stores (`localStorage` key
`s21_session_token` in the web app — `src/auth/sessionToken.ts` — or the
`sessionToken` field of the `/api/auth/*` sign-in response). Revoking
that session (sign out, or `POST /api/auth/logout`) disconnects the client.

## Domain split

The endpoint answers only on the rep host (`sa21.theroofdocs.com`, the Railway
hostname, `localhost`). A request that arrives on the homeowner domain
(`get.theroofdocs.com`, by `Host` or `X-Forwarded-Host`) is a plain `404`
before any header is read — the same `hitGetDomain` check that keeps the rep
login off that domain. Homeowner pages never learn the endpoint exists.

Origins: an absent `Origin` (Claude Code, Genie's reader) and `localhost` pass;
any other `Origin` must be one of sa21's own (the CORS allowlist in
`server/index.ts`) or the request is `403` — a DNS-rebinding guard.

Rate limit: 60 requests / minute / IP on `/mcp` (separate from `/api`).

## The five tools

Names and parameters match Genie 21's `ask_susan` registry
(`src/lib/susan/tools.ts`), and each result is already cut to the fields Genie's
`narrow` keeps, so the text content is the same shape either way. Every
argument is a string, one line, bounded; `additionalProperties: false`. All five
carry `readOnlyHint: true`.

| Tool | Runs the same handler as | Arguments | Returns |
|---|---|---|---|
| `ask` | `POST /api/susan/chat` `{message}` | `message` (2–400 chars) | `{ response, mode, confidence? }` |
| `carrier_directory` | `GET /api/insurance/companies?q=&limit=` | `q` (part of the carrier's name), `limit` ("1"–"25", default 25) | `{ totalMatching, countReturned, rows[ name, state, phone, email, address, website, category, notes ] }` |
| `carrier_learnings` | `GET /api/learning/global?insurer=&limit=` | `insurer` (exact carrier name), `limit` ("1"–"20") | `{ …, rows[ content, scope_state, scope_insurer, scope_adjuster, helpful_count, updated_at ] }` |
| `adjuster_learnings` | `GET /api/learning/global?adjuster=&limit=` | `adjuster` (exact adjuster name), `limit` ("1"–"20") | same shape as `carrier_learnings` |
| `rep_directory` | `GET /api/team`, narrowed here | `q` (**required**, ≥2 chars; case-insensitive substring of name / email / username) | `{ …, rows[ name, email, username ] }`, at most **10** rows; presence is dropped |

**`ask` spends Gemini.** It is a model call on sa21's own Gemini key (the
`gemini-2.5-flash` fallback in `susanRoutes.ts` when no presentation session is
given), so every call costs quota and is neither idempotent nor deterministic.
Its annotations say so (`idempotentHint: false`, `openWorldHint: true`) and its
description is marked MODEL CALL. Prefer the directory and learnings tools for
facts.

**`rep_directory` never lists the roster.** Genie's REST-era transport narrows
`/api/team` on Genie's side; this endpoint narrows on the server and refuses a
call without `q` (`-32602`). The whole roster cannot be pulled through MCP.

Results are capped at 400,000 characters with a `[TRUNCATED: …]` marker (Genie
caps at 48k on its side anyway). A handler failure comes back as an `isError`
text result with a short, hostname-free reason; the handler's own message is
never echoed.

## Errors

Standard JSON-RPC 2.0 codes: `-32700` parse error (malformed body → HTTP 400),
`-32600` invalid request (batches, a message without `jsonrpc: "2.0"`, a
request without an id), `-32601` method not found, `-32602` invalid params
(unknown tool, unknown / non-string / too-long / multi-line argument, missing
required argument), `-32000` for connection-level refusals (401 no session, 403
origin, 405 method, 400 protocol version, 429 rate limit). Notifications get an
empty `202`.

## Connecting

Claude Code:

```sh
claude mcp add --transport http sa21 https://sa21.theroofdocs.com/mcp \
  --header "Authorization: Bearer <session token>"
```

Genie 21: connect sa21 as an MCP source with the rep's session token as the
connection's bearer (vault-referenced, never in the address). Genie's install
flow discovers the five tools over `tools/list`; the names it already knows
from `ask_susan` are the names served here.

By hand:

```sh
curl -sS https://sa21.theroofdocs.com/mcp \
  -H "Authorization: Bearer $SA21_SESSION" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -sS https://sa21.theroofdocs.com/mcp \
  -H "Authorization: Bearer $SA21_SESSION" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"carrier_directory","arguments":{"q":"State Farm"}}}'
```
