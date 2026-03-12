/**
 * Google OAuth Routes
 * Handles the OAuth 2.0 consent flow for per-user Google Calendar + Gmail access.
 */

import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import pg from 'pg';
import { google } from 'googleapis';
import {
  createOAuth2Client,
  saveTokens,
  getGoogleStatus,
  revokeTokens,
} from '../services/googleTokenService.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function createGoogleOAuthRoutes(pool: pg.Pool): Router {
  const router = Router();

  // Helper: resolve user from x-user-email header
  async function getUserId(req: Request): Promise<string | null> {
    const email = req.headers['x-user-email'] as string;
    if (!email) return null;
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    return result.rows[0]?.id || null;
  }

  // Derive callback URL from request or env
  function getRedirectUri(req: Request): string {
    const base = process.env.BASE_URL
      || `${req.protocol}://${req.get('host')}`;
    return `${base}/api/google/callback`;
  }

  // ─── GET /auth-url — Generate Google OAuth consent URL ─────────────
  router.get('/auth-url', async (req: Request, res: Response) => {
    try {
      const userId = await getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const email = req.headers['x-user-email'] as string;
      const nonce = crypto.randomBytes(16).toString('hex');
      const state = Buffer.from(JSON.stringify({ userId, email, nonce })).toString('base64url');

      // Store nonce for CSRF validation (short TTL via metadata)
      await pool.query(
        `INSERT INTO google_oauth_tokens (user_id, access_token_encrypted, refresh_token_encrypted,
          access_token_iv, refresh_token_iv, access_token_tag, refresh_token_tag,
          scope, expires_at, google_email)
         VALUES ($1, 'pending', 'pending', 'pending', 'pending', 'pending', 'pending',
                 $2, NOW() + INTERVAL '10 minutes', NULL)
         ON CONFLICT (user_id) DO UPDATE SET
           access_token_encrypted = 'pending',
           refresh_token_encrypted = 'pending',
           access_token_iv = 'pending',
           refresh_token_iv = 'pending',
           access_token_tag = 'pending',
           refresh_token_tag = 'pending',
           scope = $2,
           expires_at = NOW() + INTERVAL '10 minutes',
           google_email = NULL,
           revoked_at = NULL,
           updated_at = NOW()`,
        [userId, nonce]
      );

      const oauth2Client = createOAuth2Client();
      const redirectUri = getRedirectUri(req);

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state,
        redirect_uri: redirectUri,
      });

      res.json({ url });
    } catch (err) {
      console.error('[GoogleOAuth] auth-url error:', err);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  });

  // ─── GET /callback — Handle Google's OAuth redirect ────────────────
  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError } = req.query;

      // Determine frontend base for redirect
      const frontendBase = process.env.BASE_URL
        || `${req.protocol}://${req.get('host')}`;

      if (oauthError) {
        return res.redirect(`${frontendBase}/?google_error=${encodeURIComponent(String(oauthError))}`);
      }

      if (!code || !state) {
        return res.redirect(`${frontendBase}/?google_error=missing_params`);
      }

      // Decode state
      let stateData: { userId: string; email: string; nonce: string };
      try {
        stateData = JSON.parse(Buffer.from(String(state), 'base64url').toString());
      } catch {
        return res.redirect(`${frontendBase}/?google_error=invalid_state`);
      }

      // Validate CSRF nonce
      const nonceCheck = await pool.query(
        `SELECT scope FROM google_oauth_tokens
         WHERE user_id = $1 AND access_token_encrypted = 'pending' AND revoked_at IS NULL`,
        [stateData.userId]
      );
      if (nonceCheck.rows.length === 0 || nonceCheck.rows[0].scope !== stateData.nonce) {
        return res.redirect(`${frontendBase}/?google_error=csrf_mismatch`);
      }

      // Exchange code for tokens
      const oauth2Client = createOAuth2Client();
      const redirectUri = getRedirectUri(req);

      const { tokens } = await oauth2Client.getToken({ code: String(code), redirect_uri: redirectUri });

      if (!tokens.access_token || !tokens.refresh_token) {
        return res.redirect(`${frontendBase}/?google_error=no_refresh_token`);
      }

      // Get Google email (graceful — don't fail the whole flow if this errors)
      oauth2Client.setCredentials(tokens);
      let googleEmail: string | null = null;
      try {
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        googleEmail = userInfo.data.email || null;
      } catch (infoErr) {
        console.warn('[GoogleOAuth] Could not fetch userinfo, using app email:', (infoErr as Error).message);
        googleEmail = stateData.email; // Fall back to the app's email
      }

      // Store encrypted tokens
      await saveTokens(pool, stateData.userId, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
        scope: SCOPES.join(' '),
      }, googleEmail);

      console.log(`[GoogleOAuth] Connected user=${stateData.email} google=${googleEmail}`);
      res.redirect(`${frontendBase}/?google_connected=1`);
    } catch (err) {
      const errMsg = (err as Error).message || 'unknown';
      console.error('[GoogleOAuth] callback error:', errMsg, err);
      const frontendBase = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      res.redirect(`${frontendBase}/?google_error=${encodeURIComponent(errMsg.substring(0, 200))}`);
    }
  });

  // ─── GET /status — Check if user has connected Google ──────────────
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const userId = await getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const status = await getGoogleStatus(pool, userId);
      res.json(status);
    } catch (err) {
      console.error('[GoogleOAuth] status error:', err);
      res.status(500).json({ error: 'Failed to check status' });
    }
  });

  // ─── POST /disconnect — Revoke Google access ──────────────────────
  router.post('/disconnect', async (req: Request, res: Response) => {
    try {
      const userId = await getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      await revokeTokens(pool, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[GoogleOAuth] disconnect error:', err);
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  });

  return router;
}
