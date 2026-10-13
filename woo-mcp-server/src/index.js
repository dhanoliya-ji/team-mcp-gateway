// index.js
// This starts our WooCommerce MCP server.
// It speaks MCP over "Streamable HTTP": the client sends a POST to /mcp
// with a JSON-RPC message, and we answer on the same HTTP request.

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { addTools } from "./tools.js";

const PORT = Number(process.env.PORT || 3000);

// A shared secret token. Only the gateway knows it (it comes from a Secret).
// This is a second lock. The first lock is the NetworkPolicy, which lets
// only the gateway pod reach this pod at all.
const MCP_TOKEN = process.env.MCP_TOKEN || "";

const app = express();
app.use(express.json());

// Health check for Kubernetes probes. No login needed.
app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

// Check the "Authorization: Bearer <token>" header.
function checkToken(req, res, next) {
  if (!MCP_TOKEN) return next(); // no token set = no check (only for local tests)
  if (req.headers.authorization === "Bearer " + MCP_TOKEN) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// The MCP endpoint.
// We use "stateless" mode: every request gets a fresh MCP server object.
// This is simple, and it means any pod can answer any request.
app.post("/mcp", checkToken, async (req, res) => {
  const server = new McpServer({ name: "woocommerce", version: "1.0.0" });
  addTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // undefined = stateless, no session IDs
    enableJsonResponse: true,      // answer with plain JSON (easy to read)
  });

  // When the HTTP request ends, clean up.
  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  }
});

// In stateless mode we do not support GET (server push) or DELETE (end session).
app.get("/mcp", (req, res) => res.status(405).json({ error: "Method not allowed" }));
app.delete("/mcp", (req, res) => res.status(405).json({ error: "Method not allowed" }));

app.listen(PORT, () => {
  console.log("WooCommerce MCP server is running on port " + PORT);
});
