/**
 * Pending storm-alert approval queue.
 *
 * When LIVE_MRMS_ALERT_ENABLED=approval-gate (or same for NWS), storm
 * alerts post to the TEST group AS PROPOSALS, with a short token. A human
 * reviewer in the test group replies ✅/❌ to forward (or skip) to the
 * Sales Team. This adds a human filter for false positives / off-territory
 * storms before they reach 100+ reps.
 *
 * Schema: see migrations/080_pending_alerts.sql
 */

import type { Pool } from 'pg';

export type PendingAlertSource = 'mrms' | 'nws';

export interface PendingAlertRow {
  id: number;
  alert_id: string;
  source: PendingAlertSource;
  target_group_id: string;
  target_bot_id: string;
  message_text: string;
  proposal_message_id: string | null;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  decided_by: string | null;
  decided_at: string | null;
  posted_message_id: string | null;
  metadata: Record<string, unknown> | null;
}

/** Generate a short, easy-to-type token like A-7Q2K9. */
function generateAlertId(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // skip ambiguous 0/O 1/I
  let s = 'A-';
  for (let i = 0; i < 5; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

/** Format a Date as wall-clock time in America/New_York, e.g. "9:42 AM ET". */
export function fmtEasternClock(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  // en-US gives "9:42 AM"; we suffix "ET" so reps see the timezone explicitly
  // (avoids EDT/EST confusion across daylight saving boundaries).
  const t = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${t} ET`;
}

/** Insert a pending alert. Returns the alert_id and the wrapper text to post. */
export async function createPendingAlert(
  pool: Pool,
  args: {
    source: PendingAlertSource;
    targetGroupId: string;
    targetBotId: string;
    messageText: string;
    metadata?: Record<string, unknown>;
    expiresInMinutes?: number;
  },
): Promise<{ alertId: string; proposalText: string; rowId: number }> {
  const expiresMin = args.expiresInMinutes ?? 30;
  // Retry up to 5 times if alert_id collides (vanishingly unlikely).
  let alertId = generateAlertId();
  let row: { id: number } | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await pool.query<{ id: number }>(
        `INSERT INTO pending_alerts
           (alert_id, source, target_group_id, target_bot_id, message_text, metadata, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' minutes')::interval)
         RETURNING id`,
        [
          alertId, args.source, args.targetGroupId, args.targetBotId,
          args.messageText, args.metadata ?? null, String(expiresMin),
        ],
      );
      row = r.rows[0];
      break;
    } catch (e) {
      if (/alert_id/i.test((e as Error).message)) {
        alertId = generateAlertId();
        continue;
      }
      throw e;
    }
  }
  if (!row) throw new Error('failed to insert pending alert after 5 retries');

  const firedAt = new Date();
  const expiresAt = new Date(firedAt.getTime() + expiresMin * 60_000);
  const proposalText =
    `🟡 PROPOSED Sales Team alert (paused for review):\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    args.messageText + '\n' +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Reply ✅ YES (or just "yes") to send to Sales Team.\n` +
    `Reply ❌ NO (or "skip") to drop it.\n` +
    `ID: ${alertId} · fired ${fmtEasternClock(firedAt)} · expires ${fmtEasternClock(expiresAt)}`;

  return { alertId, proposalText, rowId: row.id };
}

/** Attach the GroupMe message id of the proposal post (so we can track it). */
export async function attachProposalMessageId(
  pool: Pool,
  rowId: number,
  proposalMessageId: string | null,
): Promise<void> {
  if (!proposalMessageId) return;
  await pool.query(
    `UPDATE pending_alerts SET proposal_message_id = $1 WHERE id = $2`,
    [proposalMessageId, rowId],
  );
}

/**
 * Look up + approve a pending alert. Returns the row that needs forwarding,
 * or null if not found / expired / already decided.
 */
export async function approvePendingAlert(
  pool: Pool,
  alertIdOrNull: string | null,
  decidedBy: string,
): Promise<PendingAlertRow | null> {
  let row: PendingAlertRow | undefined;
  if (alertIdOrNull) {
    const r = await pool.query<PendingAlertRow>(
      `UPDATE pending_alerts
          SET status = 'approved', decided_by = $1, decided_at = NOW()
        WHERE alert_id = $2
          AND status = 'pending'
          AND expires_at > NOW()
        RETURNING *`,
      [decidedBy, alertIdOrNull.toUpperCase()],
    );
    row = r.rows[0];
  } else {
    // Approve the single most-recent pending alert.
    const r = await pool.query<PendingAlertRow>(
      `UPDATE pending_alerts
          SET status = 'approved', decided_by = $1, decided_at = NOW()
        WHERE id = (
          SELECT id FROM pending_alerts
           WHERE status = 'pending' AND expires_at > NOW()
           ORDER BY created_at DESC
           LIMIT 1
        )
        RETURNING *`,
      [decidedBy],
    );
    row = r.rows[0];
  }
  return row ?? null;
}

/** Reject a pending alert (most-recent if alertId not given). */
export async function rejectPendingAlert(
  pool: Pool,
  alertIdOrNull: string | null,
  decidedBy: string,
): Promise<PendingAlertRow | null> {
  let row: PendingAlertRow | undefined;
  if (alertIdOrNull) {
    const r = await pool.query<PendingAlertRow>(
      `UPDATE pending_alerts
          SET status = 'rejected', decided_by = $1, decided_at = NOW()
        WHERE alert_id = $2 AND status = 'pending' AND expires_at > NOW()
        RETURNING *`,
      [decidedBy, alertIdOrNull.toUpperCase()],
    );
    row = r.rows[0];
  } else {
    const r = await pool.query<PendingAlertRow>(
      `UPDATE pending_alerts
          SET status = 'rejected', decided_by = $1, decided_at = NOW()
        WHERE id = (
          SELECT id FROM pending_alerts
           WHERE status = 'pending' AND expires_at > NOW()
           ORDER BY created_at DESC
           LIMIT 1
        )
        RETURNING *`,
      [decidedBy],
    );
    row = r.rows[0];
  }
  return row ?? null;
}

/** Mark posted_message_id after we successfully forward to Sales Team. */
export async function attachPostedMessageId(
  pool: Pool,
  rowId: number,
  postedMessageId: string | null,
): Promise<void> {
  if (!postedMessageId) return;
  await pool.query(
    `UPDATE pending_alerts SET posted_message_id = $1 WHERE id = $2`,
    [postedMessageId, rowId],
  );
}

/** Periodic sweep — mark expired pending rows. Cheap, idempotent. */
export async function expireOldPendingAlerts(pool: Pool): Promise<number> {
  const r = await pool.query(
    `UPDATE pending_alerts
        SET status = 'expired'
      WHERE status = 'pending' AND expires_at <= NOW()`,
  );
  return r.rowCount ?? 0;
}

/** Detect a yes/no command from a test-group reply. Returns null if not a command. */
export function parseApprovalCommand(text: string): { action: 'approve' | 'reject'; alertId: string | null } | null {
  if (!text) return null;
  const t = text.trim();
  // Look for an embedded alert id token first
  const m = t.match(/\bA-[A-Z0-9]{4,}\b/i);
  const alertId = m ? m[0].toUpperCase() : null;

  // Approve patterns
  if (/^(yes|y|approve|send|go|ship|✅|👍)\b/i.test(t)) return { action: 'approve', alertId };
  if (/^(no|n|nope|skip|reject|drop|stop|❌|👎)\b/i.test(t)) return { action: 'reject', alertId };
  // bare token alone = approve (lazy reviewers)
  if (alertId && t.length <= alertId.length + 3) return { action: 'approve', alertId };
  return null;
}
