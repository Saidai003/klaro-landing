-- KLARO — tabla de reservas (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL,
  name          TEXT    DEFAULT '',
  role          TEXT    DEFAULT '',
  use_case      TEXT    DEFAULT '',
  locale        TEXT    DEFAULT 'es',
  ref           TEXT,
  ts            TEXT    NOT NULL,
  offer_json    TEXT    DEFAULT '{}',
  source_json   TEXT    DEFAULT '{}',
  signals_json  TEXT    DEFAULT '{}',
  behavior_json TEXT    DEFAULT '{}',
  analysis_json TEXT    DEFAULT '{}',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_email  ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at);

-- Consultas útiles:
--   SELECT COUNT(*) FROM leads;
--   SELECT email, locale, role, created_at FROM leads ORDER BY created_at DESC LIMIT 50;
--   SELECT locale, COUNT(*) n FROM leads GROUP BY locale;
--   SELECT json_extract(behavior_json,'$.maxScrollDepth') scroll, COUNT(*)
--     FROM leads GROUP BY scroll ORDER BY scroll DESC;
