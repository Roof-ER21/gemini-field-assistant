/**
 * Dispatcher — picks web vs. worker entry point based on RUN_MODE env var.
 *
 * Background: Railway's start command is defined in railway.json and
 * nixpacks.toml at the repo level. Per-service overrides via the CLI are
 * finicky (RAILWAY_RUN_COMMAND didn't take effect on the sa21-worker
 * service during setup). Dispatching in TypeScript is transparent and
 * works the same locally, on Railway, and anywhere else.
 *
 * Contract:
 *   RUN_MODE=worker  → boot the background-job process (server/worker.ts)
 *   RUN_MODE unset   → boot the Express web server  (server/index.ts)
 *                     — same as the legacy behavior, so web deploys need
 *                       no env change
 *
 * Usage in Railway: set RUN_MODE=worker on the sa21-worker service.
 * Susan 21 (web) leaves it unset.
 */
const mode = (process.env.RUN_MODE || 'web').toLowerCase();
if (mode === 'worker') {
    console.log('[start] RUN_MODE=worker — loading server/worker.js');
    await import('./worker.js');
}
else {
    console.log(`[start] RUN_MODE=${mode} — loading server/index.js (web server)`);
    await import('./index.js');
}
export {};
