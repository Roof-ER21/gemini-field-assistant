/**
 * "Connect Roof HR" — sa21's half of the round trip.
 *
 * Roof HR mints a token for a person who signs into ROOF HR and approves
 * (its server/routes/mcp-connect.ts). sa21's job is to start that trip, prove
 * it is sa21 when it redeems the code, and store the token for the right rep.
 *
 * The flow, and why it has four steps instead of two:
 *
 *   1. GET  /api/connect/roofhr/start     — as the rep, on a verified session.
 *                                           Returns Roof HR's consent URL with
 *                                           a signed `state` naming this rep.
 *   2. GET  /api/connect/roofhr/callback  — Roof HR sends the BROWSER here. This
 *                                           is a top-level navigation, so it
 *                                           carries no Authorization header and
 *                                           cannot know who is looking. It
 *                                           therefore does nothing but hand the
 *                                           code to a client route.
 *   3. POST /api/connect/roofhr/complete  — the client page, which DOES hold the
 *                                           bearer, sends the code back. Here the
 *                                           state's rep and the session's rep must
 *                                           be the same person, and that check is
 *                                           the one that matters: without it,
 *                                           someone could start a connection,
 *                                           hand the link to a colleague, and
 *                                           have the colleague's Roof HR token
 *                                           stored under their own account. The
 *                                           signature alone does not stop that —
 *                                           it is the attacker's own signed state.
 *   4. The server exchanges the code for the token with CONNECT_SECRET_SA21 and
 *      stores it encrypted, keyed to the rep (server/services/roofhrConnection.ts).
 *
 * Ships inert: without CONNECT_SECRET_SA21 and SA21_TOKEN_ENC_KEY, /start is a
 * 503 and nothing can be stored.
 */
import express from 'express';
import crypto from 'crypto';
import { ROOFHR_APP, connectionSummary, deleteConnection, encryptionConfigured, encryptionKey, saveConnection, } from '../services/roofhrConnection.js';
import { clearToolCache } from '../services/roofhrAgentTools.js';
/** Where Roof HR lives. Overridable so a staging Roof HR can be pointed at. */
function roofhrBase() {
    return (process.env.ROOFHR_BASE_URL || 'https://roofhr.up.railway.app').replace(/\/+$/, '');
}
function appSecret() {
    const value = (process.env.CONNECT_SECRET_SA21 || '').trim();
    return value.length >= 16 ? value : null;
}
/**
 * Our callback, which must match one of Roof HR's registered redirect URIs
 * EXACTLY — its allowlist has no prefixes and no wildcards, deliberately.
 * Keeping the same list here means a misconfigured BASE_URL fails with a
 * sentence instead of an opaque refusal from the other side.
 */
const REGISTERED_CALLBACKS = [
    'https://sa21.theroofdocs.com/api/connect/roofhr/callback',
    'https://sa21.up.railway.app/api/connect/roofhr/callback',
    'http://localhost:5173/api/connect/roofhr/callback',
];
function isRegistered(url) {
    return REGISTERED_CALLBACKS.includes(url);
}
/**
 * The rep's OWN origin is preferred over BASE_URL, as long as it is registered.
 *
 * sa21 answers on two domains (sa21.theroofdocs.com and sa21.up.railway.app) and
 * the session token lives in localStorage, which is per-origin. Sending a rep who
 * started on one domain back to the other would land them somewhere their session
 * does not exist, and /complete would refuse a trip they completed correctly.
 * BASE_URL stays the fallback because it is also what Google OAuth is registered
 * against, so it is the one address that is certainly ours.
 */
export function callbackUrl(req) {
    const origins = [
        `${req.protocol}://${req.get('host')}`,
        process.env.BASE_URL || '',
    ];
    for (const origin of origins) {
        if (!origin)
            continue;
        const url = `${origin.replace(/\/+$/, '')}/api/connect/roofhr/callback`;
        if (isRegistered(url))
            return { url };
    }
    return {
        url: null,
        error: `This server's return address (${origins[0]}/api/connect/roofhr/callback) is not registered ` +
            'with Roof HR. Register it there, or set BASE_URL to an address that is.',
    };
}
// ---------------------------------------------------------------------------
// Signed state
// ---------------------------------------------------------------------------
/** Long enough to read a consent screen, short enough that a stale link dies. */
const STATE_TTL_MS = 10 * 60_000;
/**
 * Derived from the token-encryption key rather than adding another secret, and
 * derived rather than reused so that a signing oracle can never be turned into
 * anything that touches stored tokens.
 */
function stateKey() {
    const key = encryptionKey();
    if (!key)
        return null;
    return crypto.createHmac('sha256', key).update('sa21:connect-state:v1').digest();
}
export function signState(userId, now = Date.now()) {
    const key = stateKey();
    if (!key)
        return null;
    const payload = Buffer.from(JSON.stringify({ u: userId, n: crypto.randomBytes(12).toString('base64url'), e: now + STATE_TTL_MS })).toString('base64url');
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}
export function verifyState(state, now = Date.now()) {
    const key = stateKey();
    if (!key)
        return { userId: null, error: 'Roof HR connections are not configured.' };
    const raw = String(state ?? '');
    const dot = raw.lastIndexOf('.');
    if (dot <= 0)
        return { userId: null, error: 'That connection request is not valid.' };
    const payload = raw.slice(0, dot);
    const provided = Buffer.from(raw.slice(dot + 1), 'base64url');
    const expected = crypto.createHmac('sha256', key).update(payload).digest();
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return { userId: null, error: 'That connection request is not valid.' };
    }
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    }
    catch {
        return { userId: null, error: 'That connection request is not valid.' };
    }
    if (typeof parsed.u !== 'string' || parsed.u.length === 0) {
        return { userId: null, error: 'That connection request is not valid.' };
    }
    if (typeof parsed.e !== 'number' || parsed.e <= now) {
        return { userId: null, error: 'That connection request expired. Start again.' };
    }
    return { userId: parsed.u };
}
/**
 * The consent URL for one rep, or null if connections are not switched on or
 * this server's return address is not registered.
 *
 * Shared with Susan's agent so she can hand a rep their own link in chat — the
 * place the need actually comes up ("what's my PTO balance?"). The signed state
 * inside it is not a secret: completing the trip requires the rep's own session,
 * and a state naming someone else is refused at /complete.
 */
export function buildConnectStartUrl(req, userId) {
    if (!encryptionConfigured() || !appSecret())
        return null;
    const cb = callbackUrl(req);
    if (!cb.url)
        return null;
    const state = signState(userId);
    if (!state)
        return null;
    const url = new URL(`${roofhrBase()}/connect/agent`);
    url.searchParams.set('app', 'sa21');
    url.searchParams.set('redirect_uri', cb.url);
    url.searchParams.set('state', state);
    return url.toString();
}
/**
 * Every route except the bare redirect requires a VERIFIED session, read from
 * the session row itself rather than from the `x-user-email` header. Binding a
 * Roof HR token to a rep on the strength of an asserted address would be the
 * header hole wearing a new hat.
 */
function requireVerifiedSession(req, res, next) {
    const userId = req.session?.userId;
    if (!userId) {
        res.status(401).json({
            error: 'Sign in again with Continue with Google before connecting Roof HR.',
            code: 'SESSION_REQUIRED',
        });
        return;
    }
    req.connectUserId = userId;
    next();
}
export function createConnectRoutes(pool) {
    const router = express.Router();
    // ---- GET /roofhr/start ----
    router.get('/roofhr/start', requireVerifiedSession, (req, res) => {
        if (!encryptionConfigured()) {
            return res.status(503).json({ error: 'Roof HR connections are not switched on yet (no token key).' });
        }
        if (!appSecret()) {
            return res.status(503).json({ error: 'Roof HR connections are not switched on yet (no app secret).' });
        }
        const cb = callbackUrl(req);
        if (!cb.url)
            return res.status(500).json({ error: cb.error });
        const url = buildConnectStartUrl(req, req.connectUserId);
        if (!url)
            return res.status(503).json({ error: 'Roof HR connections are not switched on yet.' });
        res.json({ url, expiresInSeconds: Math.floor(STATE_TTL_MS / 1000) });
    });
    // ---- GET /roofhr/callback ----
    // A top-level navigation: no Authorization header, so nothing here can know
    // who is looking. It hands the code to a client route that does.
    router.get('/roofhr/callback', (req, res) => {
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        // The app is a single panel-switching page with no URL router, so the code
        // goes to the root as a query parameter where RoofHrCallbackHandler reads it.
        const target = new URL('/', `${req.protocol}://${req.get('host')}`);
        target.searchParams.set('connect', 'roofhr');
        if (code && state) {
            target.searchParams.set('code', code);
            target.searchParams.set('state', state);
        }
        else {
            target.searchParams.set('error', String(req.query.error || 'missing_code'));
        }
        res.redirect(302, target.pathname + target.search);
    });
    // ---- POST /roofhr/complete ----
    router.post('/roofhr/complete', requireVerifiedSession, async (req, res) => {
        const secret = appSecret();
        if (!encryptionConfigured() || !secret) {
            return res.status(503).json({ error: 'Roof HR connections are not switched on yet.' });
        }
        const body = (req.body ?? {});
        const verified = verifyState(body.state);
        if (!verified.userId)
            return res.status(400).json({ error: verified.error });
        // THE check. A signed state proves only that WE issued it — to whoever asked.
        // It must also belong to the person whose session is completing the trip,
        // or one rep could have another rep's token filed under their own account.
        if (verified.userId !== req.connectUserId) {
            console.warn(`[connect] state/session mismatch — state=${verified.userId} session=${req.connectUserId}; refusing`);
            return res.status(400).json({ error: 'That connection was started by a different account. Start again.' });
        }
        const code = String(body.code ?? '').trim();
        if (!code)
            return res.status(400).json({ error: 'That connection is missing its code. Start again.' });
        const cb = callbackUrl(req);
        if (!cb.url)
            return res.status(500).json({ error: cb.error });
        let exchanged;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15_000);
            const response = await fetch(`${roofhrBase()}/api/mcp/connect/exchange`, {
                method: 'POST',
                redirect: 'manual',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ app: 'sa21', code, redirect_uri: cb.url, client_secret: secret }),
            }).finally(() => clearTimeout(timer));
            exchanged = (await response.json().catch(() => ({})));
            if (!response.ok) {
                // Roof HR's refusals are already written for a person; relay rather than rephrase.
                return res.status(400).json({ error: exchanged?.error || 'Roof HR would not complete that connection.' });
            }
        }
        catch (err) {
            console.error('[connect] exchange failed:', err.message);
            return res.status(502).json({ error: 'Could not reach Roof HR to finish connecting.' });
        }
        if (!exchanged.token || !exchanged.roofhrUserId || !exchanged.endpoint) {
            return res.status(502).json({ error: 'Roof HR returned an incomplete connection.' });
        }
        // Roof HR's own expiry is 180 days; store the same horizon so a dead token
        // reads as "not connected" here rather than failing mid-answer.
        const expiresAt = new Date(Date.now() + 180 * 86_400_000);
        const saved = await saveConnection(pool, {
            userId: req.connectUserId,
            remoteUserId: exchanged.roofhrUserId,
            token: exchanged.token,
            scopes: Array.isArray(exchanged.scopes) ? exchanged.scopes : [],
            endpoint: exchanged.endpoint,
            expiresAt,
        });
        if (!saved.ok)
            return res.status(500).json({ error: saved.error });
        clearToolCache();
        const summary = await connectionSummary(pool, req.connectUserId);
        console.log(`[connect] Roof HR connected for sa21 user ${req.connectUserId} (roofhr ${exchanged.roofhrUserId})`);
        res.status(201).json({ connected: true, connection: summary });
    });
    // ---- GET /roofhr/status ----
    router.get('/roofhr/status', requireVerifiedSession, async (req, res) => {
        const configured = encryptionConfigured() && appSecret() !== null;
        const summary = configured ? await connectionSummary(pool, req.connectUserId) : null;
        res.json({
            configured,
            connected: summary !== null,
            connection: summary,
        });
    });
    // ---- DELETE /roofhr ----
    router.delete('/roofhr', requireVerifiedSession, async (req, res) => {
        const removed = await deleteConnection(pool, req.connectUserId, ROOFHR_APP);
        clearToolCache();
        res.json({ disconnected: removed });
    });
    return router;
}
export default createConnectRoutes;
