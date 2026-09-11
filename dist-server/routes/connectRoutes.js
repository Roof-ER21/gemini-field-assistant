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
import { connectionSummary, deleteConnection, encryptionConfigured, encryptionKey, saveConnection, } from '../services/roofhrConnection.js';
import { clearToolCache } from '../services/roofhrAgentTools.js';
import { CONNECTED_APPS, appBaseUrl, appSecret, findConnectedApp, registeredCallbacks, } from '../services/connectedApps.js';
import { appAllowsEmail } from '../services/connectedApps.js';
/**
 * The rep's OWN origin is preferred over BASE_URL, as long as it is registered
 * with this peer.
 *
 * sa21 answers on two domains and the session token lives in localStorage,
 * which is per-origin. Sending a rep who started on one domain back to the
 * other would land them somewhere their session does not exist, and /complete
 * would refuse a trip they completed correctly. BASE_URL stays the fallback
 * because it is also what Google OAuth is registered against, so it is the one
 * address that is certainly ours.
 */
export function callbackUrl(req, app) {
    const registered = registeredCallbacks(app);
    const origins = [`${req.protocol}://${req.get('host')}`, process.env.BASE_URL || ''];
    for (const origin of origins) {
        if (!origin)
            continue;
        const url = `${origin.replace(/\/+$/, '')}/api/connect/${app.slug}/callback`;
        if (registered.includes(url))
            return { url };
    }
    return {
        url: null,
        error: `This server's return address (${origins[0]}/api/connect/${app.slug}/callback) is not registered ` +
            `with ${app.displayName}. Register it there, or set BASE_URL to an address that is.`,
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
export function signState(userId, appSlug, now = Date.now()) {
    const key = stateKey();
    if (!key)
        return null;
    const payload = Buffer.from(JSON.stringify({ u: userId, a: appSlug, n: crypto.randomBytes(12).toString('base64url'), e: now + STATE_TTL_MS })).toString('base64url');
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
    return { userId: parsed.u, appSlug: typeof parsed.a === 'string' ? parsed.a : undefined };
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
export function buildConnectStartUrl(req, userId, app) {
    if (!encryptionConfigured() || !appSecret(app))
        return null;
    const cb = callbackUrl(req, app);
    if (!cb.url)
        return null;
    // The state names the peer as well as the rep, so a state issued for one
    // connection cannot be replayed to complete a different one.
    const state = signState(userId, app.slug);
    if (!state)
        return null;
    const url = new URL(`${appBaseUrl(app)}/connect/agent`);
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
            error: 'Sign in again with Continue with Google before connecting another app.',
            code: 'SESSION_REQUIRED',
        });
        return;
    }
    req.connectUserId = userId;
    next();
}
function notOpen(res, app) {
    res.status(403).json({ error: `${app.displayName} is not open for connections yet.`, code: 'APP_NOT_OPEN' });
}
export function createConnectRoutes(pool) {
    const router = express.Router();
    /**
     * Resolve `:app` to a peer, or 404. Every route below is per-peer; the paths
     * that were `/roofhr/...` still match, so the live Roof HR connection is
     * untouched by the generalisation.
     */
    function peerOr404(req, res) {
        const app = findConnectedApp(req.params.app);
        if (!app) {
            res.status(404).json({ error: 'That is not an app Susan can be connected to.' });
            return null;
        }
        return app;
    }
    // ---- GET /:app/start ----
    router.get('/:app/start', requireVerifiedSession, (req, res) => {
        const app = peerOr404(req, res);
        if (!app)
            return;
        if (!appAllowsEmail(app, req.session?.email))
            return notOpen(res, app);
        if (!encryptionConfigured()) {
            return res.status(503).json({ error: `${app.displayName} connections are not switched on yet (no token key).` });
        }
        if (!appSecret(app)) {
            return res.status(503).json({ error: `${app.displayName} connections are not switched on yet (no app secret).` });
        }
        const cb = callbackUrl(req, app);
        if (!cb.url)
            return res.status(500).json({ error: cb.error });
        const url = buildConnectStartUrl(req, req.connectUserId, app);
        if (!url)
            return res.status(503).json({ error: `${app.displayName} connections are not switched on yet.` });
        res.json({ url, app: app.slug, expiresInSeconds: Math.floor(STATE_TTL_MS / 1000) });
    });
    // ---- GET /:app/callback ----
    // A top-level navigation: no Authorization header, so nothing here can know
    // who is looking. It hands the code to a client route that does.
    router.get('/:app/callback', (req, res) => {
        const app = peerOr404(req, res);
        if (!app)
            return;
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        // The app is a single panel-switching page with no URL router, so the code
        // goes to the root as a query parameter where the callback handler reads it.
        const target = new URL('/', `${req.protocol}://${req.get('host')}`);
        target.searchParams.set('connect', app.slug);
        if (code && state) {
            target.searchParams.set('code', code);
            target.searchParams.set('state', state);
        }
        else {
            target.searchParams.set('error', String(req.query.error || 'missing_code'));
        }
        res.redirect(302, target.pathname + target.search);
    });
    // ---- POST /:app/complete ----
    router.post('/:app/complete', requireVerifiedSession, async (req, res) => {
        const app = peerOr404(req, res);
        if (!app)
            return;
        if (!appAllowsEmail(app, req.session?.email))
            return notOpen(res, app);
        const secret = appSecret(app);
        if (!encryptionConfigured() || !secret) {
            return res.status(503).json({ error: `${app.displayName} connections are not switched on yet.` });
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
        // And it must be a state issued for THIS peer, so a code cannot be carried
        // from one connection into another app's completion.
        if (verified.appSlug && verified.appSlug !== app.slug) {
            console.warn(`[connect] state/app mismatch — state=${verified.appSlug} route=${app.slug}; refusing`);
            return res.status(400).json({ error: 'That connection was started for a different app. Start again.' });
        }
        const code = String(body.code ?? '').trim();
        if (!code)
            return res.status(400).json({ error: 'That connection is missing its code. Start again.' });
        const cb = callbackUrl(req, app);
        if (!cb.url)
            return res.status(500).json({ error: cb.error });
        let exchanged;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15_000);
            const response = await fetch(`${appBaseUrl(app)}/api/mcp/connect/exchange`, {
                method: 'POST',
                redirect: 'manual',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ app: 'sa21', code, redirect_uri: cb.url, client_secret: secret }),
            }).finally(() => clearTimeout(timer));
            exchanged = (await response.json().catch(() => ({})));
            if (!response.ok) {
                // The peer's refusals are already written for a person; relay rather than rephrase.
                const message = typeof exchanged?.error === 'string' ? exchanged.error : null;
                return res.status(400).json({ error: message || `${app.displayName} would not complete that connection.` });
            }
        }
        catch (err) {
            console.error(`[connect] ${app.slug} exchange failed:`, err.message);
            return res.status(502).json({ error: `Could not reach ${app.displayName} to finish connecting.` });
        }
        const token = typeof exchanged.token === 'string' ? exchanged.token : '';
        const endpoint = typeof exchanged.endpoint === 'string' ? exchanged.endpoint : '';
        // Each peer names its own id field (`roofhrUserId`, `cc24UserId`) — that is
        // deliberate on their side, so the app never has to guess the person from
        // an email. Accept the peer's own name, or a generic one.
        const remoteUserId = [`${app.slug}UserId`, 'remoteUserId', 'userId']
            .map((k) => exchanged[k])
            .find((v) => typeof v === 'string' && v.length > 0);
        if (!token || !endpoint || !remoteUserId) {
            return res.status(502).json({ error: `${app.displayName} returned an incomplete connection.` });
        }
        // The peers' own expiry is 180 days; store the same horizon so a dead token
        // reads as "not connected" here rather than failing mid-answer.
        const expiresAt = new Date(Date.now() + 180 * 86_400_000);
        const saved = await saveConnection(pool, {
            userId: req.connectUserId,
            app: app.slug,
            remoteUserId,
            token,
            scopes: Array.isArray(exchanged.scopes) ? exchanged.scopes : [],
            endpoint,
            expiresAt,
        });
        if (!saved.ok)
            return res.status(500).json({ error: saved.error });
        clearToolCache();
        const summary = await connectionSummary(pool, req.connectUserId, app.slug);
        console.log(`[connect] ${app.slug} connected for sa21 user ${req.connectUserId} (remote ${remoteUserId})`);
        res.status(201).json({ connected: true, app: app.slug, connection: summary });
    });
    // ---- GET /:app/status ----
    router.get('/:app/status', requireVerifiedSession, async (req, res) => {
        const app = peerOr404(req, res);
        if (!app)
            return;
        const configured = encryptionConfigured() && appSecret(app) !== null && appAllowsEmail(app, req.session?.email);
        const summary = configured ? await connectionSummary(pool, req.connectUserId, app.slug) : null;
        res.json({ app: app.slug, displayName: app.displayName, configured, connected: summary !== null, connection: summary });
    });
    // ---- GET /status — every peer at once, for the header ----
    router.get('/status', requireVerifiedSession, async (req, res) => {
        const keyed = encryptionConfigured();
        const apps = await Promise.all(CONNECTED_APPS.map(async (app) => {
            // "Not configured" for someone the app is not open to hides the button.
            const configured = keyed && appSecret(app) !== null && appAllowsEmail(app, req.session?.email);
            const summary = configured ? await connectionSummary(pool, req.connectUserId, app.slug) : null;
            return {
                app: app.slug,
                displayName: app.displayName,
                configured,
                connected: summary !== null,
                connection: summary,
            };
        }));
        res.json({ apps });
    });
    // ---- DELETE /:app ----
    router.delete('/:app', requireVerifiedSession, async (req, res) => {
        const app = peerOr404(req, res);
        if (!app)
            return;
        const removed = await deleteConnection(pool, req.connectUserId, app.slug);
        clearToolCache();
        res.json({ app: app.slug, disconnected: removed });
    });
    return router;
}
export default createConnectRoutes;
