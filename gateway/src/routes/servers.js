// routes/servers.js
// Admins add, edit, disable and remove upstream MCP servers here.
// Everyone logged in can see the list (but never the credentials).

import express from "express";
import { db, now } from "../db.js";
import { encrypt } from "../security.js";
import { requireLogin, requireAdmin } from "../auth.js";
import { checkServerUrl } from "../url-check.js";
import { getAllServers, getStatus, checkServer, forgetServer, adminOnlyList, isToolAllowed } from "../upstreams.js";

export const serverRoutes = express.Router();
serverRoutes.use(requireLogin);

// The name becomes the tool prefix, so we keep it simple:
// small letters, numbers and "-" only. (No "_", because "__" is our separator.)
const NAME_RULE = /^[a-z0-9-]{1,30}$/;
const AUTH_TYPES = ["none", "bearer", "header"];

// What the browser may see about a server.
// Note: no secret here! Only "hasCredential: true/false".
// Members do not see "admin only" tools.
function publicServer(server, user) {
  const status = getStatus(server.id);
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    authType: server.auth_type,
    authHeaderName: server.auth_header_name,
    hasCredential: !!server.secret_encrypted,
    enabled: !!server.enabled,
    status: status.status,
    error: status.error,
    checkedAt: status.checkedAt,
    tools: status.tools
      .filter((t) => isToolAllowed(server, t.name, user))
      .map((t) => ({ name: t.name, description: t.description })),
    adminOnlyTools: adminOnlyList(server),
  };
}

function findServer(id) {
  return db.prepare("SELECT * FROM servers WHERE id = ?").get(Number(id));
}

// GET /api/servers
serverRoutes.get("/", (req, res) => {
  res.json({ servers: getAllServers().map((server) => publicServer(server, req.user)) });
});

// POST /api/servers  { name, url, authType, authHeaderName, secret }
serverRoutes.post("/", requireAdmin, async (req, res) => {
  const { name, url, authType = "none", authHeaderName = null, secret = "" } = req.body;

  if (!NAME_RULE.test(name || "")) return res.status(400).json({ error: "Name: use only a-z, 0-9 and '-'" });
  if (!AUTH_TYPES.includes(authType)) return res.status(400).json({ error: "Bad auth type" });
  if (authType === "header" && !authHeaderName) return res.status(400).json({ error: "Header name is needed" });
  if (db.prepare("SELECT id FROM servers WHERE name = ?").get(name)) return res.status(400).json({ error: "Name already used" });

  try {
    await checkServerUrl(url);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const result = db
    .prepare(
      `INSERT INTO servers (name, url, auth_type, auth_header_name, secret_encrypted, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(name, url, authType, authHeaderName, secret ? encrypt(secret) : null, now());

  // Check it right away, so the admin sees the status and tools.
  const server = findServer(result.lastInsertRowid);
  await checkServer(server);
  res.json({ server: publicServer(server, req.user) });
});

// PUT /api/servers/:id  { url?, authType?, authHeaderName?, secret?, enabled? }
// If "secret" is empty, we keep the old one.
serverRoutes.put("/:id", requireAdmin, async (req, res) => {
  const server = findServer(req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const url = req.body.url ?? server.url;
  const authType = req.body.authType ?? server.auth_type;
  const authHeaderName = req.body.authHeaderName ?? server.auth_header_name;
  const enabled = req.body.enabled === undefined ? server.enabled : req.body.enabled ? 1 : 0;
  // A list of tool names that only admins may use, saved as "a,b,c".
  const adminOnlyTools = Array.isArray(req.body.adminOnlyTools)
    ? req.body.adminOnlyTools.join(",")
    : server.admin_only_tools;
  let secretEncrypted = server.secret_encrypted;
  if (req.body.secret) secretEncrypted = encrypt(req.body.secret);
  if (authType === "none") secretEncrypted = null;

  if (!AUTH_TYPES.includes(authType)) return res.status(400).json({ error: "Bad auth type" });
  if (url !== server.url) {
    try {
      await checkServerUrl(url);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  db.prepare(
    "UPDATE servers SET url = ?, auth_type = ?, auth_header_name = ?, secret_encrypted = ?, enabled = ?, admin_only_tools = ? WHERE id = ?"
  ).run(url, authType, authHeaderName, secretEncrypted, enabled, adminOnlyTools, server.id);

  const updated = findServer(server.id);
  await checkServer(updated);
  res.json({ server: publicServer(updated, req.user) });
});

// DELETE /api/servers/:id
serverRoutes.delete("/:id", requireAdmin, (req, res) => {
  const server = findServer(req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  db.prepare("DELETE FROM servers WHERE id = ?").run(server.id);
  forgetServer(server.id);
  res.json({ ok: true });
});

// POST /api/servers/:id/check  -> check the status now
serverRoutes.post("/:id/check", async (req, res) => {
  const server = findServer(req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  await checkServer(server);
  res.json({ server: publicServer(server, req.user) });
});
