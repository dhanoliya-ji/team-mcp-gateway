// routes/audit.js
// The audit log and the tool list for the dashboard.

import express from "express";
import { requireLogin } from "../auth.js";
import { readAudit } from "../audit.js";
import { toolsForUser } from "../mcp-endpoint.js";

export const auditRoutes = express.Router();
auditRoutes.use(requireLogin);

// GET /api/audit  ->  admin sees every call, a member sees only their own calls
auditRoutes.get("/audit", (req, res) => {
  const userId = req.user.role === "admin" ? null : req.user.id;
  res.json({ rows: readAudit({ userId }) });
});

// GET /api/tools  ->  the same tool list an MCP client would get
auditRoutes.get("/tools", (req, res) => {
  res.json({ tools: toolsForUser(req.user) });
});
