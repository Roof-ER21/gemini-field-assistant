/**
 * Settings → Connected agents: the rep's own agent tokens.
 *
 *   GET    /api/agent-tokens        → { tokens, endpoint, tools }   (own, not revoked; never the hash)
 *   POST   /api/agent-tokens        { name, expiresInDays? }  → the plaintext token ONCE
 *   DELETE /api/agent-tokens/:id    → revoke one of the caller's own tokens
 *
 * These routes accept ONLY a verified session (Authorization: Bearer s21_…).
 * In Stage 1 the rest of the API still honours the legacy `x-user-email`
 * header; honouring it here would let anyone who knows a rep's address mint a
 * credential as that rep. An agent token cannot reach these routes either:
 * session.ts never resolves one, so it arrives with no session.
 */
import { Router } from 'express';
import { AGENT_READ_TOOLS, AGENT_TOKEN_DEFAULT_DAYS, AGENT_TOKEN_MAX_DAYS, AGENT_TOKEN_PREFIX, listAgentTokens, mintAgentToken, parseAgentTokenRequest, revokeAgentToken, } from '../auth/agentTokens.js';
/** Where an agent connects. SA21_PUBLIC_URL lets a preview name its own host. */
export function mcpEndpointUrl() {
    const base = (process.env.SA21_PUBLIC_URL || 'https://sa21.theroofdocs.com').replace(/\/+$/, '');
    return `${base}/mcp`;
}
export function createAgentTokenRouter(pool) {
    const router = Router();
    router.use((req, res, next) => {
        if (!req.session || req.authMechanism !== 'session') {
            res.status(401).json({ error: 'Sign in again to manage connected agents.', code: 'SESSION_REQUIRED' });
            return;
        }
        next();
    });
    router.get('/', async (req, res) => {
        try {
            const tokens = await listAgentTokens(pool, req.session.userId);
            res.set('Cache-Control', 'private, no-store');
            res.json({
                tokens,
                endpoint: mcpEndpointUrl(),
                prefix: AGENT_TOKEN_PREFIX,
                tools: AGENT_READ_TOOLS,
                defaultDays: AGENT_TOKEN_DEFAULT_DAYS,
                maxDays: AGENT_TOKEN_MAX_DAYS,
            });
        }
        catch (err) {
            console.error('[agent-tokens] list failed:', err.message);
            res.status(500).json({ error: 'Could not load your connected agents.' });
        }
    });
    router.post('/', async (req, res) => {
        const parsed = parseAgentTokenRequest(req.body);
        if (parsed.ok === false) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        try {
            const { token, row } = await mintAgentToken(pool, { userId: req.session.userId, name: parsed.name, days: parsed.days });
            // The plaintext leaves the server exactly once, here. It is never logged.
            res.set('Cache-Control', 'private, no-store');
            res.status(201).json({ ...row, token, endpoint: mcpEndpointUrl(), readOnly: true });
        }
        catch (err) {
            console.error('[agent-tokens] create failed:', err.message);
            res.status(500).json({ error: 'Could not create the agent token.' });
        }
    });
    router.delete('/:id', async (req, res) => {
        try {
            const outcome = await revokeAgentToken(pool, { userId: req.session.userId, id: String(req.params.id ?? '') });
            if (outcome === 'not_found') {
                res.status(404).json({ error: 'Token not found.' });
                return;
            }
            res.json({ id: req.params.id, revoked: true, alreadyRevoked: outcome === 'already_revoked' });
        }
        catch (err) {
            console.error('[agent-tokens] revoke failed:', err.message);
            res.status(500).json({ error: 'Could not revoke the agent token.' });
        }
    });
    return router;
}
