// auth.js
// Who is calling? This file answers that question.
//
// There are two kinds of tokens:
//   1. Login token  ("sess_...")  - the dashboard gets it after login.
//   2. API key      ("mcpgw_...") - a user makes it for MCP clients like Claude Code.
// Both are sent as:  Authorization: Bearer <token>
// We hash the token and look up the hash in the database.

import { db, now } from "./db.js";
import { sha256 } from "./security.js";
import { writeAudit } from "./audit.js";

// Find the user for a login token. Returns null if not found or expired.
function userFromSession(token) {
  const row = db
    .prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .get(sha256(token), now());
  if (!row) return null;
  return db.prepare("SELECT * FROM users WHERE id = ? AND disabled = 0").get(row.user_id) || null;
}

// Find the user for an API key.
// Returns { user, error }. error is set if the key is revoked or unknown.
function userFromApiKey(token) {
  const key = db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(sha256(token));
  if (!key) return { user: null, error: "Unknown API key" };

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(key.user_id);
  if (key.revoked_at) return { user: user, error: "API key was revoked" };
  if (!user || user.disabled) return { user: user, error: "User is disabled" };

  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), key.id);
  return { user: user, error: null };
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

// Middleware for the dashboard API: only login tokens are allowed.
export function requireLogin(req, res, next) {
  const user = userFromSession(tokenFromRequest(req));
  if (!user) return res.status(401).json({ error: "Please log in" });
  req.user = user;
  req.sessionToken = tokenFromRequest(req);
  next();
}

// Middleware: only admins may continue.
export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Only admins can do this" });
  next();
}

// Middleware for the MCP endpoint: API keys (external clients)
// or login tokens (our own chat agent, acting as the logged-in user).
export function requireMcpAuth(req, res, next) {
  const token = tokenFromRequest(req);

  if (token.startsWith("sess_")) {
    const user = userFromSession(token);
    if (!user) return res.status(401).json({ error: "Session expired" });
    req.user = user;
    req.via = "chat";
    return next();
  }

  const { user, error } = userFromApiKey(token);
  if (error) {
    // If we know who it was (revoked key), write it to the audit log.
    if (user) {
      writeAudit({ user, via: "mcp-client", server: "-", tool: "-", startedAt: now(), durationMs: 0, ok: false, error });
    }
    return res.status(401).json({ error: error });
  }
  req.user = user;
  req.via = "mcp-client";
  next();
}
