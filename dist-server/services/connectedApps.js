/**
 * The Roof-ER apps Susan can be connected to, as the rep.
 *
 * Each entry is one peer that mints per-person tokens through the same
 * authorization-code flow (see its own server/mcp/connect.ts). Susan never
 * holds a login of her own for any of them: a rep connects their own account,
 * and Susan reads on that token or not at all.
 *
 * Adding a peer is an entry here plus a registry entry on the peer's side.
 * There is deliberately no dynamic registration — every entry is a decision
 * about which app may hold tokens for Roof-ER people.
 */
export const CONNECTED_APPS = [
    {
        slug: 'roofhr',
        displayName: 'Roof HR',
        noun: 'Roof HR',
        baseUrlEnv: 'ROOFHR_BASE_URL',
        defaultBaseUrl: 'https://roofhr.up.railway.app',
        secretEnvs: ['CONNECT_SECRET_ROOFHR', 'CONNECT_SECRET_SA21'],
        toolPrefix: 'roofhr_',
        connectHint: 'the "Connect Roof HR" button at the top of this chat',
    },
    {
        slug: 'cc24',
        displayName: 'the Command Center',
        noun: 'the Command Center (CC24)',
        baseUrlEnv: 'CC24_BASE_URL',
        defaultBaseUrl: 'https://cc24.trussly.net',
        secretEnvs: ['CONNECT_SECRET_CC24'],
        toolPrefix: 'cc24_',
        connectHint: 'the "Connect CC24" button at the top of this chat',
        // Ahmed only for now (2026-09-11): CC24 has no real reps on it yet.
        allowedEmailsEnv: 'CONNECT_ALLOWED_EMAILS_CC24',
        allowedEmailsDefault: ['ahmed.mahmoud@theroofdocs.com'],
    },
];
/**
 * May this person connect (or use a stored connection to) this peer?
 * Pass the VERIFIED session email only; an asserted header is not an identity.
 */
export function appAllowsEmail(app, email) {
    if (!app.allowedEmailsEnv)
        return true;
    const raw = (process.env[app.allowedEmailsEnv] ?? '').trim();
    const list = (raw ? raw.split(',') : [...(app.allowedEmailsDefault ?? [])])
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    if (list.includes('*'))
        return true;
    const who = String(email ?? '').trim().toLowerCase();
    return who.length > 0 && list.includes(who);
}
export function findConnectedApp(slug) {
    const s = String(slug ?? '').trim().toLowerCase();
    return CONNECTED_APPS.find((a) => a.slug === s) ?? null;
}
export function appBaseUrl(app) {
    return (process.env[app.baseUrlEnv] || app.defaultBaseUrl).replace(/\/+$/, '');
}
/** The peer's secret, or null when this peer is not switched on yet. */
export function appSecret(app) {
    for (const name of app.secretEnvs) {
        const value = (process.env[name] || '').trim();
        if (value.length >= 16)
            return value;
    }
    return null;
}
/**
 * Our callback for one peer. Every peer registers these exact strings on its
 * side — no prefixes, no wildcards — so the list lives here too, and a
 * misconfigured BASE_URL fails with a sentence instead of an opaque refusal
 * from the other end.
 */
export function registeredCallbacks(app) {
    return [
        'https://sa21.theroofdocs.com',
        'https://sa21.up.railway.app',
        'http://localhost:5173',
    ].map((origin) => `${origin}/api/connect/${app.slug}/callback`);
}
/** Every peer this server could talk to if a rep connected it. */
export function configuredApps() {
    return CONNECTED_APPS.filter((a) => appSecret(a) !== null);
}
