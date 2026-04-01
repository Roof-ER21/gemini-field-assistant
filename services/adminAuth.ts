import { authService } from './authService';

/**
 * Returns request headers for admin API calls.
 * Includes both x-user-email and x-admin-token so that routes
 * protected by the PIN middleware accept the request.
 */
export function getAdminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const user = authService.getCurrentUser();
  const token = localStorage.getItem('s21_admin_token') || '';
  return {
    'Content-Type': 'application/json',
    ...(user?.email ? { 'x-user-email': user.email } : {}),
    ...(token ? { 'x-admin-token': token } : {}),
    ...extra,
  };
}
