/**
 * The shape of a signed-in rep, and how one is built from a login response.
 *
 * Split out of authService.ts because that module touches `window` at import
 * time, and this half is pure: it is the piece worth testing on its own, and
 * the piece that was getting `created_at` wrong.
 */

export type Division = 'insurance' | 'retail';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: 'sales_rep' | 'manager' | 'admin' | 'marketing';
  state: 'VA' | 'MD' | 'PA' | null;
  division?: Division | null;
  created_at: Date;
  last_login_at: Date;
}

/**
 * Build the client's user record from what the server actually said.
 *
 * `created_at` used to be stamped `new Date()` here no matter what came back,
 * so an account created months ago looked like it was made this second. The
 * division gate (App.tsx) reads that timestamp to decide whether someone is a
 * brand-new account, so every existing rep signing in on a fresh browser was
 * asked "Which team are you on?" — and answering writes a division the UI says
 * only an admin can change afterwards. The same omission hid `division`, which
 * is the other half of the gate.
 *
 * The server now sends both (server/index.ts clientProfileFields). Trust them,
 * and fall back only when a field genuinely is not there — an older server, or
 * a database without the late `division` column.
 */
export function authUserFromBackend(
  backendUser: any,
  fallback: { id?: string; email: string; name: string },
): AuthUser {
  const parsedCreatedAt = backendUser?.created_at ? new Date(backendUser.created_at) : null;
  return {
    id: backendUser?.id || fallback.id || crypto.randomUUID(),
    email: backendUser?.email || fallback.email.toLowerCase(),
    name: backendUser?.name || fallback.name,
    role: (backendUser?.role as AuthUser['role']) || 'sales_rep',
    state: (backendUser?.state as AuthUser['state']) ?? null,
    division: (backendUser?.division as Division | null) ?? null,
    // An unparseable date is worse than no date: it would read as 1970 or NaN.
    created_at: parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : new Date(),
    last_login_at: new Date(),
  };
}

