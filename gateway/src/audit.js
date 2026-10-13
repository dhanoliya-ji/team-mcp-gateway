// audit.js
// Every tool call is written here: who, which server and tool, when,
// how long it took, and if it worked.

import { db } from "./db.js";

export function writeAudit({ user, via, server, tool, startedAt, durationMs, ok, error }) {
  db.prepare(
    `INSERT INTO audit_log (user_id, user_email, via, server, tool, started_at, duration_ms, ok, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user ? user.id : null,
    user ? user.email : "unknown",
    via,
    server,
    tool,
    startedAt,
    durationMs,
    ok ? 1 : 0,
    error || null
  );
}

// Read the newest rows. If userId is given, only that user's rows.
export function readAudit({ userId = null, limit = 200 } = {}) {
  if (userId) {
    return db.prepare("SELECT * FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(userId, limit);
  }
  return db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit);
}
