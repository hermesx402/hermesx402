const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hermes.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    owner_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    price_sol REAL NOT NULL,
    wallet_address TEXT NOT NULL,
    owner_api_key_hash TEXT NOT NULL,
    success_rate REAL NOT NULL DEFAULT 100.0,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_api_key_hash) REFERENCES api_keys(key_hash)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    hirer_wallet TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    escrow_amount_sol REAL NOT NULL,
    payment_proof TEXT,
    payment_verified_at TEXT,
    completion_tx_signature TEXT,
    result TEXT,
    result_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  );
`);

// Migrate: add result columns if missing
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN result TEXT`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN result_at TEXT`);
} catch (_) { /* column already exists */ }

module.exports = db;
