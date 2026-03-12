/**
 * Google Token Service
 * AES-256-GCM encryption for OAuth tokens + auto-refresh.
 * Provides getValidOAuth2Client(pool, userId) for Calendar/Gmail services.
 */
import crypto from 'crypto';
import { google } from 'googleapis';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------
function getEncryptionKey() {
    const hex = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
    }
    return Buffer.from(hex, 'hex');
}
function encrypt(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
        ciphertext: encrypted,
        iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
    };
}
function decrypt(ciphertext, ivHex, tagHex) {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
// ---------------------------------------------------------------------------
// OAuth2 client factory
// ---------------------------------------------------------------------------
function createOAuth2Client() {
    return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Store OAuth tokens (encrypted) for a user. UPSERT pattern.
 */
export async function saveTokens(pool, userId, tokens, googleEmail) {
    const accessEnc = encrypt(tokens.access_token);
    const refreshEnc = encrypt(tokens.refresh_token);
    const expiresAt = new Date(tokens.expiry_date).toISOString();
    await pool.query(`INSERT INTO google_oauth_tokens
       (user_id, access_token_encrypted, access_token_iv, access_token_tag,
        refresh_token_encrypted, refresh_token_iv, refresh_token_tag,
        scope, expires_at, google_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       access_token_iv = EXCLUDED.access_token_iv,
       access_token_tag = EXCLUDED.access_token_tag,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       refresh_token_iv = EXCLUDED.refresh_token_iv,
       refresh_token_tag = EXCLUDED.refresh_token_tag,
       scope = EXCLUDED.scope,
       expires_at = EXCLUDED.expires_at,
       google_email = EXCLUDED.google_email,
       updated_at = NOW(),
       revoked_at = NULL`, [
        userId,
        accessEnc.ciphertext, accessEnc.iv, accessEnc.tag,
        refreshEnc.ciphertext, refreshEnc.iv, refreshEnc.tag,
        tokens.scope,
        expiresAt,
        googleEmail,
    ]);
    console.log(`[GoogleToken] Saved tokens for user=${userId} google=${googleEmail}`);
}
/**
 * Get a ready-to-use OAuth2 client for a user.
 * Returns null if no tokens exist (rep hasn't connected Google).
 * Auto-refreshes expired access tokens.
 */
export async function getValidOAuth2Client(pool, userId) {
    const result = await pool.query(`SELECT * FROM google_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL AND access_token_encrypted != 'pending'`, [userId]);
    if (result.rows.length === 0)
        return null;
    const row = result.rows[0];
    const accessToken = decrypt(row.access_token_encrypted, row.access_token_iv, row.access_token_tag);
    const refreshToken = decrypt(row.refresh_token_encrypted, row.refresh_token_iv, row.refresh_token_tag);
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: new Date(row.expires_at).getTime(),
    });
    // Auto-refresh if expired or expiring within 5 minutes
    const expiresAt = new Date(row.expires_at).getTime();
    const bufferMs = 5 * 60 * 1000;
    if (Date.now() > expiresAt - bufferMs) {
        console.log(`[GoogleToken] Refreshing expired token for user=${userId}`);
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            if (credentials.access_token && credentials.expiry_date) {
                const newAccessEnc = encrypt(credentials.access_token);
                await pool.query(`UPDATE google_oauth_tokens
           SET access_token_encrypted = $1, access_token_iv = $2, access_token_tag = $3,
               expires_at = $4, updated_at = NOW()
           WHERE user_id = $5 AND revoked_at IS NULL`, [
                    newAccessEnc.ciphertext, newAccessEnc.iv, newAccessEnc.tag,
                    new Date(credentials.expiry_date).toISOString(),
                    userId,
                ]);
                oauth2Client.setCredentials(credentials);
            }
        }
        catch (err) {
            console.error(`[GoogleToken] Refresh failed for user=${userId}:`, err.message);
            return null; // Token is dead — treat as not connected
        }
    }
    return oauth2Client;
}
/**
 * Get the Google email for display (no decryption needed).
 */
export async function getGoogleStatus(pool, userId) {
    const result = await pool.query(`SELECT google_email, scope, created_at FROM google_oauth_tokens
     WHERE user_id = $1 AND revoked_at IS NULL AND access_token_encrypted != 'pending'`, [userId]);
    if (result.rows.length === 0) {
        return { connected: false, google_email: null, scope: null, connected_at: null };
    }
    const row = result.rows[0];
    return {
        connected: true,
        google_email: row.google_email,
        scope: row.scope,
        connected_at: row.created_at,
    };
}
/**
 * Revoke tokens and soft-delete.
 */
export async function revokeTokens(pool, userId) {
    // Try to revoke with Google (best-effort)
    try {
        const client = await getValidOAuth2Client(pool, userId);
        if (client && client.credentials.access_token) {
            await client.revokeToken(client.credentials.access_token);
        }
    }
    catch (err) {
        console.warn(`[GoogleToken] Revoke with Google failed (best-effort):`, err.message);
    }
    await pool.query(`UPDATE google_oauth_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    console.log(`[GoogleToken] Revoked tokens for user=${userId}`);
}
/** Export the factory for routes that need to generate auth URLs */
export { createOAuth2Client };
