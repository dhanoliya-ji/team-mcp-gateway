// routes/keys.js
// API keys for MCP clients (Claude Code, Cursor, MCP Inspector).
//
// - A member can make and revoke their OWN keys.
// - An admin can see all keys, make a key for any user, and revoke any key.
// - The full key is shown only once. We save only its SHA-256 hash.

import express from "express";
import { db, now } from "../db.js";
import { newApiKey, sha256 } from "../security.js";
import { requireLogin } from "../auth.js";

export const keyRoutes = express.Router();
keyRoutes.use(requireLogin);

// What the browser may see about a key (never the key or its hash).
function publicKey(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.email,
    name: row.name,
    prefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

const SELECT_KEYS = "SELECT api_keys.*, users.email FROM api_keys JOIN users ON users.id = api_keys.user_id";

// GET /api/keys  ->  my keys (admin: all keys)
keyRoutes.get("/", (req, res) => {
  const rows =
    req.user.role === "admin"
      ? db.prepare(SELECT_KEYS + " ORDER BY api_keys.id DESC").all()
      : db.prepare(SELECT_KEYS + " WHERE user_id = ? ORDER BY api_keys.id DESC").all(req.user.id);
  res.json({ keys: rows.map(publicKey) });
});

// POST /api/keys  { name, userId? }  ->  { key, apiKey }
keyRoutes.post("/", (req, res) => {
  const name = String(req.body.name || "my key").slice(0, 50);

  // Members can only make keys for themselves.
  let userId = req.user.id;
  if (req.body.userId && req.user.role === "admin") userId = Number(req.body.userId);
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(userId)) {
    return res.status(404).json({ error: "User not found" });
  }

  const apiKey = newApiKey();
  const result = db
    .prepare("INSERT INTO api_keys (user_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, name, sha256(apiKey), apiKey.slice(0, 12), now());

  const row = db.prepare(SELECT_KEYS + " WHERE api_keys.id = ?").get(result.lastInsertRowid);
  // The full key is returned only now. After this, nobody can see it again.
  res.json({ key: publicKey(row), apiKey });
});

// DELETE /api/keys/:id  ->  revoke the key (it stops working right away)
keyRoutes.delete("/:id", (req, res) => {
  const key = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(Number(req.params.id));
  if (!key) return res.status(404).json({ error: "Key not found" });
  if (key.user_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "This is not your key" });
  }
  db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now(), key.id);
  res.json({ ok: true });
});
