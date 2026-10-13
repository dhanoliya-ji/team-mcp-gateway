// routes/users.js
// Admins invite team members and can turn them off.
//
// "Invite" here means: the admin types the email and role, and the
// gateway makes a one-time password. The admin gives it to the new member.

import express from "express";
import { db, now } from "../db.js";
import { hashPassword, newPassword } from "../security.js";
import { requireLogin, requireAdmin } from "../auth.js";
import { publicUser } from "./login.js";

export const userRoutes = express.Router();
userRoutes.use(requireLogin, requireAdmin);

// GET /api/users
userRoutes.get("/", (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY id").all();
  res.json({ users: users.map(publicUser) });
});

// POST /api/users  { email, name, role }  ->  { user, password }
userRoutes.post("/", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const name = String(req.body.name || "").trim() || email;
  const role = req.body.role === "admin" ? "admin" : "member";

  if (!email.includes("@")) return res.status(400).json({ error: "Please give a valid email" });
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return res.status(400).json({ error: "This email is already invited" });
  }

  const password = newPassword();
  const result = db
    .prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(email, name, role, hashPassword(password), now());

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  // The password is shown only once, here.
  res.json({ user: publicUser(user), password });
});

// PUT /api/users/:id  { disabled }  ->  turn a user off or on
userRoutes.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You cannot disable yourself" });

  const disabled = req.body.disabled ? 1 : 0;
  db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disabled, id);
  // A disabled user is also logged out everywhere.
  if (disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);

  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
});
