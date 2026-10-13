// routes/login.js
// Dashboard login and logout.

import express from "express";
import { db, now } from "../db.js";
import { checkPassword, newSessionToken, sha256 } from "../security.js";
import { requireLogin } from "../auth.js";

export const loginRoutes = express.Router();

const SESSION_HOURS = 12;

// POST /api/login  { email, password }  ->  { token, user }
loginRoutes.post("/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = db.prepare("SELECT * FROM users WHERE email = ? AND disabled = 0").get(email);
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Wrong email or password" });
  }

  // Make a login token. We save only its hash.
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), user.id, expiresAt);

  res.json({ token, user: publicUser(user) });
});

// POST /api/logout
loginRoutes.post("/logout", requireLogin, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(req.sessionToken));
  res.json({ ok: true });
});

// GET /api/me  ->  the logged-in user
loginRoutes.get("/me", requireLogin, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Remove old sessions now and then.
setInterval(() => db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now()), 3600 * 1000);

// Only the safe fields of a user (never the password hash).
export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, disabled: !!user.disabled, created_at: user.created_at };
}
