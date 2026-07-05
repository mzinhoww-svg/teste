import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CRM_DATA_DIR || join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'crm.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema -----------------------------------------------------------------
// Tudo local, num único arquivo SQLite. Nada sai da sua máquina.
db.exec(`
CREATE TABLE IF NOT EXISTS pipelines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'open'   -- open | won | lost
);

CREATE TABLE IF NOT EXISTS cards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id  INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  phase_id     INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  company      TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  email        TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  source       TEXT DEFAULT '',
  value        REAL DEFAULT 0,
  score        INTEGER DEFAULT 0,
  priority     TEXT DEFAULT 'media',          -- baixa | media | alta
  status       TEXT DEFAULT 'aberto',         -- aberto | ganho | perdido
  fields       TEXT DEFAULT '{}',             -- campos customizados (JSON)
  notes        TEXT DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                   -- note | agent | system | phase | message
  agent      TEXT DEFAULT '',
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  key            TEXT NOT NULL UNIQUE,        -- qualifier | scorer | enricher | copilot | proposal
  name           TEXT NOT NULL,
  description    TEXT DEFAULT '',
  enabled        INTEGER NOT NULL DEFAULT 1,
  auto_phase_id  INTEGER REFERENCES phases(id) ON DELETE SET NULL,
  system_prompt  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS automations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id  INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  trigger_phase_id INTEGER REFERENCES phases(id) ON DELETE CASCADE,
  agent_key    TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_cards_pipeline ON cards(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_cards_phase ON cards(phase_id);
CREATE INDEX IF NOT EXISTS idx_activities_card ON activities(card_id);
CREATE INDEX IF NOT EXISTS idx_phases_pipeline ON phases(pipeline_id);
`);

export function logActivity(cardId, kind, content, agent = '') {
  db.prepare(
    'INSERT INTO activities (card_id, kind, agent, content) VALUES (?, ?, ?, ?)'
  ).run(cardId, kind, agent, content);
}
