/**
 * Google Gmail Service
 * Send emails and create drafts via the rep's connected Gmail account.
 */

import { google } from 'googleapis';
import type pg from 'pg';
import { randomBytes } from 'crypto';
import { getValidOAuth2Client } from './googleTokenService.js';

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;       // HTML body
  text?: string;      // optional plaintext alternative; auto-derived from body if omitted
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

// Derive a readable plaintext version from an HTML body so every email carries a
// text/plain part (previews, minimalist clients, and accessibility all rely on
// it — an HTML-only email shows blank where HTML isn't rendered).
function htmlToText(html: string): string {
  return html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(tr|p|div|h[1-6]|table|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>\s*<td[^>]*>/gi, '   ')   // keep table-row cells on one line
    .replace(/<[^>]+>/g, '')                  // strip remaining tags
    // Entity decoding. &amp; MUST come last: decoding it first would turn a
    // literal "&amp;mdash;" into "&mdash;" and then into an em dash.
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rsquo;/gi, '’')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&times;/gi, '×')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, '  ').trim())
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build an RFC 2822 message and base64url encode it for the Gmail API.
 */
// RFC 2047 encoded-word for subjects containing non-ASCII (accented homeowner
// names, em-dashes, etc.). Pure-ASCII subjects pass through unchanged. Without
// this the raw UTF-8 bytes land in the header and mail clients mojibake them
// (e.g. "José" → "JosÃ©"), even though the body renders fine via charset=utf-8.
function encodeSubject(subject: string): string {
  if (!/[^\x00-\x7F]/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function buildRawMessage(from: string, params: SendEmailParams): string {
  const boundary = `=_sa21_${randomBytes(16).toString('hex')}`;
  const text = (params.text && params.text.trim()) ? params.text : htmlToText(params.body);

  // Headers: filter out absent optional headers (empty strings) — an empty line
  // here would prematurely terminate the header block.
  const headers = [
    `From: ${from}`,
    `To: ${params.to}`,
    params.cc ? `Cc: ${params.cc}` : '',
    params.bcc ? `Bcc: ${params.bcc}` : '',
    params.replyTo ? `Reply-To: ${params.replyTo}` : '',
    `Subject: ${encodeSubject(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean).join('\r\n');

  // Body: the two alternative parts. Blank lines here are REQUIRED (they separate
  // part headers from part content), so this list is NOT filtered. Plaintext
  // first, HTML last (RFC 2046: least→most preferred).
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.body,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const message = `${headers}\r\n\r\n${body}`;

  return Buffer.from(message, 'utf8')
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
