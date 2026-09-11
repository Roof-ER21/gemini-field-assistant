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

export type ConnectedAppSlug = 'roofhr' | 'cc24';

export type ConnectedApp = {
  slug: ConnectedAppSlug;
  /** How Susan refers to it in conversation. */
  displayName: string;
  /** Used in the prompt: "you cannot see <noun> for them yet". */
  noun: string;
  /** Where the peer lives; the env var lets a staging peer be pointed at. */
  baseUrlEnv: string;
  defaultBaseUrl: string;
  /**
   * The shared secret sa21 proves itself with at /exchange.
   *
   * One per peer, NOT one for sa21: the same value on both peers would mean a
   * leak at either app impersonates sa21 to the other. The first name that is
   * set wins, which is how `roofhr` keeps working — `CONNECT_SECRET_SA21` is
   * the name already deployed for it, and renaming a live secret buys nothing.
   */
  secretEnvs: readonly string[];
  /** Gemini tool names are prefixed with this so two peers can never collide. */
  toolPrefix: string;
  /** What the rep is told to click, when they have no connection. */
  connectHint: string;
  /**
   * Who may connect this peer at all. Unset = everyone (Roof HR). When set, the
   * env var (comma-separated emails, or `*` for everyone) wins over the code
   * default, so an unset var fails CLOSED to the default list, never open.
   */
  allowedEmailsEnv?: string;
  allowedEmailsDefault?: readonly string[];
};

export const CONNECTED_APPS: readonly ConnectedApp[] = [
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
export function appAllowsEmail(app: ConnectedApp, email: string | null | undefined): boolean {
  if (!app.allowedEmailsEnv) return true;
  const raw = (process.env[app.allowedEmailsEnv] ?? '').trim();
  const list = (raw ? raw.split(',') : [...(app.allowedEmailsDefault ?? [])])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.includes('*')) return true;
  const who = String(email ?? '').trim().toLowerCase();
  return who.length > 0 && list.includes(who);
}

export function findConnectedApp(slug: unknown): ConnectedApp | null {
  const s = String(slug ?? '').trim().toLowerCase();
  return CONNECTED_APPS.find((a) => a.slug === s) ?? null;
}

export function appBaseUrl(app: ConnectedApp): string {
  return (process.env[app.baseUrlEnv] || app.defaultBaseUrl).replace(/\/+$/, '');
}

/** The peer's secret, or null when this peer is not switched on yet. */
export function appSecret(app: ConnectedApp): string | null {
  for (const name of app.secretEnvs) {
    const value = (process.env[name] || '').trim();
    if (value.length >= 16) return value;
  }
  return null;
}

/**
 * Our callback for one peer. Every peer registers these exact strings on its
 * side — no prefixes, no wildcards — so the list lives here too, and a
 * misconfigured BASE_URL fails with a sentence instead of an opaque refusal
 * from the other end.
 */
export function registeredCallbacks(app: ConnectedApp): string[] {
  return [
    'https://sa21.theroofdocs.com',
    'https://sa21.up.railway.app',
    'http://localhost:5173',
  ].map((origin) => `${origin}/api/connect/${app.slug}/callback`);
}

/** Every peer this server could talk to if a rep connected it. */
export function configuredApps(): ConnectedApp[] {
  return CONNECTED_APPS.filter((a) => appSecret(a) !== null);
}
