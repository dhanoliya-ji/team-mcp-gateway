// db.js
// The gateway saves its data in a small SQLite database file.
// We use "node:sqlite", which is built into Node.js (no extra package).
//
// Tables:
//   users      - team members (admin or member)
//   sessions   - dashboard logins
//   api_keys   - keys for MCP clients (we save only a hash of each key)
//   servers    - upstream MCP servers (credentials are encrypted)
//   audit_log  - one row for every tool call
//   settings   - small key/value flags

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, "gateway.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,          -- 'admin' or 'member'
    password_hash TEXT NOT NULL,
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,          -- hash of the login token
    user_id    INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,    -- SHA-256 of the key, never the key itself
    key_prefix   TEXT NOT NULL,           -- first few letters, so people can tell keys apart
    created_at   TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at   TEXT                     -- not empty = key is revoked
  );

  CREATE TABLE IF NOT EXISTS servers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL UNIQUE, -- used as tool prefix, like "woocommerce"
    url              TEXT NOT NULL,
    auth_type        TEXT NOT NULL,        -- 'none', 'bearer' or 'header'
    auth_header_name TEXT,                 -- only for auth_type 'header'
    secret_encrypted TEXT,                 -- the credential, encrypted
    enabled          INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    user_email  TEXT,
    via         TEXT,                     -- 'chat' or 'mcp-client'
    server      TEXT,
    tool        TEXT,
    started_at  TEXT NOT NULL,
    duration_ms INTEGER,
    ok          INTEGER NOT NULL,         -- 1 = success, 0 = failed
    error       TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Small helper: the time now, as text.
export function now() {
  return new Date().toISOString();
}
