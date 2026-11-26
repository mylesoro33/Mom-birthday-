import { query } from "./db";
import { decrypt, encrypt } from "./crypto";
import { env } from "./env";
import { DEFAULT_IGNORE, DEFAULT_PHRASES } from "./matcher";

export type Settings = {
  googleEmail: string | null;
  hasGoogle: boolean;
  needsReconnect: boolean;
  hasPushover: boolean;
  enabled: boolean;
  phrases: string[];
  ignorePhrases: string[];
  cooldownMinutes: number;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
  sound: string;
  watchSince: Date;
  lastAlertAt: Date | null;
  lastPollAt: Date | null;
  lastPollError: string | null;
};

type Row = {
  google_email: string | null;
  refresh_token: string | null;
  needs_reconnect: boolean;
  pushover_user: string | null;
  pushover_token: string | null;
  enabled: boolean;
  phrases: string[];
  ignore_phrases: string[];
  cooldown_minutes: number;
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
  sound: string;
  watch_since: string | Date;
  last_alert_at: string | Date | null;
  last_poll_at: string | Date | null;
  last_poll_error: string | null;
};

async function row(): Promise<Row> {
  await query(
    `INSERT INTO settings (id, phrases, ignore_phrases) VALUES (1, $1::text::jsonb, $2::text::jsonb) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_PHRASES), JSON.stringify(DEFAULT_IGNORE)],
  );
  const [r] = await query<Row>(`SELECT * FROM settings WHERE id = 1`);
  return r;
}

const d = (v: string | Date | null) => (v ? new Date(v) : null);

export async function getSettings(): Promise<Settings> {
  const r = await row();
  return {
    googleEmail: r.google_email,
    hasGoogle: !!r.refresh_token,
    needsReconnect: r.needs_reconnect,
    hasPushover: !!(r.pushover_user && r.pushover_token),
    enabled: r.enabled,
    phrases: r.phrases,
    ignorePhrases: r.ignore_phrases,
    cooldownMinutes: r.cooldown_minutes,
    quietEnabled: r.quiet_enabled,
    quietStart: r.quiet_start,
    quietEnd: r.quiet_end,
    timezone: r.timezone,
    sound: r.sound,
    watchSince: new Date(r.watch_since),
    lastAlertAt: d(r.last_alert_at),
    lastPollAt: d(r.last_poll_at),
    lastPollError: r.last_poll_error,
  };
}

/** Decrypt, or null if the value is missing or can't be decrypted (e.g. ENCRYPTION_KEY was changed). */
function open(v: string | null): string | null {
  if (!v) return null;
  try {
    return decrypt(v, env.encryptionKey);
  } catch {
    console.error("A stored secret could not be decrypted. Re-enter it on the Connect page.");
    return null;
  }
}

export async function getSecrets() {
  const r = await row();
  return {
    refreshToken: open(r.refresh_token),
    pushoverUser: open(r.pushover_user),
    pushoverToken: open(r.pushover_token),
  };
}

export async function saveGoogle(email: string, refreshToken: string | null) {
  await row();
  if (refreshToken) {
    await query(
      `UPDATE settings SET google_email = $1, refresh_token = $2, needs_reconnect = FALSE,
         watch_since = now(), updated_at = now() WHERE id = 1`,
      [email, encrypt(refreshToken, env.encryptionKey)],
    );
  } else {
    await query(`UPDATE settings SET google_email = $1, updated_at = now() WHERE id = 1`, [email]);
  }
}

export async function disconnectGoogle() {
  await query(`UPDATE settings SET refresh_token = NULL, needs_reconnect = FALSE, updated_at = now() WHERE id = 1`);
}

export async function markNeedsReconnect() {
  await query(`UPDATE settings SET needs_reconnect = TRUE WHERE id = 1`);
}

export async function savePushover(user: string, token: string) {
  await row();
  await query(`UPDATE settings SET pushover_user = $1, pushover_token = $2, updated_at = now() WHERE id = 1`, [
    encrypt(user, env.encryptionKey),
    encrypt(token, env.encryptionKey),
  ]);
}

export async function saveSettings(s: {
  enabled: boolean;
  phrases: string[];
  ignorePhrases: string[];
  cooldownMinutes: number;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
  sound: string;
}) {
  const before = await getSettings();
  await query(
    `UPDATE settings SET enabled = $1, phrases = $2::text::jsonb, ignore_phrases = $3::text::jsonb, cooldown_minutes = $4,
       quiet_enabled = $5, quiet_start = $6, quiet_end = $7, timezone = $8, sound = $9,
       watch_since = CASE WHEN $10 THEN now() ELSE watch_since END, updated_at = now()
     WHERE id = 1`,
    [
      s.enabled,
      JSON.stringify(s.phrases),
      JSON.stringify(s.ignorePhrases),
      s.cooldownMinutes,
      s.quietEnabled,
      s.quietStart,
      s.quietEnd,
      s.timezone,
      s.sound,
      // Turning the alarm back on: only watch mail that arrives from now on.
      s.enabled && !before.enabled,
    ],
  );
}

export async function recordPoll(error: string | null) {
  await query(`UPDATE settings SET last_poll_at = now(), last_poll_error = $1 WHERE id = 1`, [error]);
}

export async function recordAlertSent() {
  await query(`UPDATE settings SET last_alert_at = now() WHERE id = 1`);
}

/** Atomically claim a Gmail message id. Returns false if it was already processed. */
export async function claimMessage(id: string): Promise<boolean> {
  const r = await query(
    `INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id`,
    [id],
  );
  return r.length > 0;
}

export async function pruneProcessed() {
  await query(`DELETE FROM processed_messages WHERE processed_at < now() - interval '14 days'`);
  await query(`DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY created_at DESC LIMIT 500)`);
}

export type EventKind = "detection" | "alert" | "suppressed" | "test" | "error";
export type LogEvent = {
  id: string;
  created_at: string;
  kind: EventKind;
  message_id: string | null;
  subject: string | null;
  phrase: string | null;
  receipt: string | null;
  detail: string | null;
};

export async function logEvent(e: {
  kind: EventKind;
  messageId?: string;
  subject?: string;
  phrase?: string;
  receipt?: string;
  detail?: string;
}) {
  await query(
    `INSERT INTO events (kind, message_id, subject, phrase, receipt, detail) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      e.kind,
      e.messageId ?? null,
      e.subject ? e.subject.slice(0, 200) : null,
      e.phrase ?? null,
      e.receipt ?? null,
      e.detail ? e.detail.slice(0, 500) : null,
    ],
  );
}

export async function recentEvents(limit = 20): Promise<LogEvent[]> {
  const rows = await query<LogEvent & { created_at: string | Date }>(
    `SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, id: String(r.id), created_at: new Date(r.created_at).toISOString() }));
}
