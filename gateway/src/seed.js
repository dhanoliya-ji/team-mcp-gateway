// seed.js
// On the very first start, we add:
//   1. the first admin user (email and password come from a Secret)
//   2. the first servers, like the WooCommerce MCP server
// We save a flag, so this runs only once. If an admin later removes a
// server, it does not come back after a restart.

import { db, now } from "./db.js";
import { config } from "./config.js";
import { hashPassword, encrypt } from "./security.js";

function getFlag(key) {
  return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value;
}

function setFlag(key, value) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function seed() {
  // ----- 1. First admin -----
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (userCount === 0) {
    if (!config.adminPassword) {
      throw new Error("ADMIN_PASSWORD is not set. Cannot create the first admin.");
    }
    db.prepare("INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, 'admin', ?, ?)").run(
      config.adminEmail.toLowerCase(),
      "Admin",
      hashPassword(config.adminPassword),
      now()
    );
    console.log("Created first admin: " + config.adminEmail);
  }

  // ----- 2. First servers -----
  if (getFlag("servers_seeded") === "yes") return;

  for (const item of config.seedServers) {
    // The token itself is in another env var (from a Secret), not in the JSON.
    const secret = item.tokenEnv ? process.env[item.tokenEnv] || "" : "";
    db.prepare(
      `INSERT OR IGNORE INTO servers (name, url, auth_type, auth_header_name, secret_encrypted, enabled, created_at)
       VALUES (?, ?, ?, NULL, ?, 1, ?)`
    ).run(item.name, item.url, secret ? "bearer" : "none", secret ? encrypt(secret) : null, now());
    console.log("Registered server: " + item.name + " -> " + item.url);
  }
  setFlag("servers_seeded", "yes");
}
