/**
 * Google Gmail Service
 * Send emails and create drafts via the rep's connected Gmail account.
 */

import { google } from 'googleapis';
import type pg from 'pg';
import { getValidOAuth2Client } from './googleTokenService.js';

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;       // HTML body
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

/**
 * Build an RFC 2822 message and base64url encode it for the Gmail API.
 */
function buildRawMessage(from: string, params: SendEmailParams): string {
  const lines = [
    `From: ${from}`,
    `To: ${params.to}`,
    params.cc ? `Cc: ${params.cc}` : '',
    params.bcc ? `Bcc: ${params.bcc}` : '',
    params.replyTo ? `Reply-To: ${params.replyTo}` : '',
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    params.body,
  ].filter(Boolean).join('\r\n');

  return Buffer.from(lines)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendGmailEmail(
  pool: pg.Pool,
  userId: string,
  params: SendEmailParams
): Promise<{ success: boolean; messageId?: string; threadId?: string; error?: string }> {
  const auth = await getValidOAuth2Client(pool, userId);
  if (!auth) {
    return { success: false, error: 'Google account not connected. Connect in Profile settings.' };
  }

  const gmail = google.gmail({ version: 'v1', auth });

  // Get the sender's email from their profile
  let senderEmail = 'me';
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    senderEmail = profile.data.emailAddress || 'me';
  } catch {
    // Fall through — 'me' works for sending
  }

  try {
    const raw = buildRawMessage(senderEmail, params);
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    console.log(`[Gmail] Sent email to=${params.to} msgId=${result.data.id} user=${userId}`);
    return {
      success: true,
      messageId: result.data.id || undefined,
      threadId: result.data.threadId || undefined,
    };
  } catch (err) {
    console.error('[Gmail] Send error:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function createGmailDraft(
  pool: pg.Pool,
  userId: string,
  params: SendEmailParams
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  const auth = await getValidOAuth2Client(pool, userId);
  if (!auth) {
    return { success: false, error: 'Google account not connected. Connect in Profile settings.' };
  }

  const gmail = google.gmail({ version: 'v1', auth });

  let senderEmail = 'me';
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    senderEmail = profile.data.emailAddress || 'me';
  } catch { /* fallthrough */ }

  try {
    const raw = buildRawMessage(senderEmail, params);
    const result = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw },
      },
    });

    console.log(`[Gmail] Draft created id=${result.data.id} user=${userId}`);
    return {
      success: true,
      draftId: result.data.id || undefined,
    };
  } catch (err) {
    console.error('[Gmail] Draft error:', err);
    return { success: false, error: (err as Error).message };
  }
}
