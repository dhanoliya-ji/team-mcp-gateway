// index.js
// This starts the gateway.
//
//   /mcp       -> the ONE MCP endpoint for all tools (needs an API key)
//   /api/...   -> the API for the React dashboard (needs a login)
//   /healthz   -> health check for Kubernetes

import express from "express";
import { config } from "./config.js";
import { seed } from "./seed.js";
import { startHealthChecks } from "./upstreams.js";
import { requireMcpAuth } from "./auth.js";
import { handleMcpRequest } from "./mcp-endpoint.js";
import { loginRoutes } from "./routes/login.js";
import { serverRoutes } from "./routes/servers.js";
import { userRoutes } from "./routes/users.js";
import { keyRoutes } from "./routes/keys.js";
import { auditRoutes } from "./routes/audit.js";
import { chatRoutes } from "./routes/chat.js";

// Make sure we have the first admin and the first servers.
seed();

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check for Kubernetes probes.
app.get("/healthz", (req, res) => res.json({ ok: true }));

// The MCP endpoint.
app.post("/mcp", requireMcpAuth, handleMcpRequest);
app.get("/mcp", (req, res) => res.status(405).json({ error: "Method not allowed" }));
app.delete("/mcp", (req, res) => res.status(405).json({ error: "Method not allowed" }));

// Dashboard API.
app.use("/api", loginRoutes);
app.use("/api", auditRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/users", userRoutes);
app.use("/api/keys", keyRoutes);
app.use("/api/chat", chatRoutes);

// Start checking the upstream servers in the background.
startHealthChecks();

app.listen(config.port, () => {
  console.log("Gateway is running on port " + config.port);
});
