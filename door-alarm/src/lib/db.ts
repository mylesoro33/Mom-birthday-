import postgres from "postgres";
import { env } from "./env";

let _sql: postgres.Sql | null = null;
let _ready: Promise<void> | null = null;

function client() {
  if (!_sql) {
    const url = env.databaseUrl;
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    _sql = postgres(url, {
      max: 1, // serverless: one connection per instance (use your provider's pooled URL)
      idle_timeout: 20,
      prepare: false, // compatible with PgBouncer / Neon / Supabase poolers
      ssl: local ? false : "require",
      onnotice: () => {},
    });
  }
  return _sql;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (
    id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    google_email     TEXT,
    refresh_token    TEXT,          -- AES-256-GCM encrypted
    needs_reconnect  BOOLEAN NOT NULL DEFAULT FALSE,
    pushover_user    TEXT,          -- encrypted
    pushover_token   TEXT,          -- encrypted
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    phrases          JSONB NOT NULL,
    ignore_phrases   JSONB NOT NULL,
    cooldown_minutes INT NOT NULL DEFAULT 20,
    quiet_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    quiet_start      TEXT NOT NULL DEFAULT '22:00',
    quiet_end        TEXT NOT NULL DEFAULT '07:00',
    timezone         TEXT NOT NULL DEFAULT 'America/New_York',
    sound            TEXT NOT NULL DEFAULT 'persistent',
    watch_since      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_alert_at    TIMESTAMPTZ,
    last_poll_at     TIMESTAMPTZ,
    last_poll_error  TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id         BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind       TEXT NOT NULL,       -- detection | alert | suppressed | test | error
    message_id TEXT,
    subject    TEXT,                -- subject line only, never the body
    phrase     TEXT,
    receipt    TEXT,
    detail     TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS events_created_at ON events (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS processed_messages (
    message_id   TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

async function ensureSchema() {
  if (!_ready) {
    _ready = (async () => {
      const sql = client();
      for (const stmt of SCHEMA) await sql.unsafe(stmt);
    })().catch((e) => {
      _ready = null;
      throw e;
    });
  }
  return _ready;
}

/** Run a parameterized query ($1, $2, ...) after making sure tables exist. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  return (await client().unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[];
}
