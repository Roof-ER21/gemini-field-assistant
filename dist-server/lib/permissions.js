/**
 * Centralized role / permission helpers.
 *
 * Replaces the duplicated `isAdminUser` helpers that lived inline in
 * profileRoutes.ts and qrAnalyticsRoutes.ts. Adds a `canManageQR` check that
 * grants QR-codes admin functionality to BOTH admin and marketing roles.
 *
 * Marketing role design:
 *   - Same PIN auth flow as admin (admin_pin_hash + admin_sessions table)
 *   - Route-level role check is what scopes them to QR endpoints only
 *   - Admin can override / do anything marketing can do
 */
const QR_MANAGER_ROLES = new Set(['admin', 'marketing']);
const PIN_ELIGIBLE_ROLES = new Set(['admin', 'marketing']);
async function getRole(pool, email) {
    if (!email)
        return null;
    try {
        const r = await pool.query('SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        return r.rows[0]?.role ?? null;
    }
    catch (e) {
        console.error('[permissions] getRole failed:', e);
        return null;
    }
}
/** True if the user's role is exactly 'admin'. */
export async function isAdmin(pool, email) {
    return (await getRole(pool, email)) === 'admin';
}
/**
 * True if the user can manage QR profiles, videos, and analytics.
 * Granted to admin and marketing roles.
 */
export async function canManageQR(pool, email) {
    const role = await getRole(pool, email);
    return role !== null && QR_MANAGER_ROLES.has(role);
}
/**
 * True if the user is allowed to set/use the admin PIN flow.
 * Both admin and marketing get PIN-protected sessions; the route-level role
 * check is what restricts marketing users to QR endpoints.
 */
export async function canAccessAdminPin(pool, email) {
    const role = await getRole(pool, email);
    return role !== null && PIN_ELIGIBLE_ROLES.has(role);
}
/** Returns the user's role, or null if unknown. Useful for diagnostics. */
export async function getUserRole(pool, email) {
    return getRole(pool, email);
}
