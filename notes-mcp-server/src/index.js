// notes-mcp-server
// A very small MCP server that keeps notes for the team.
// It is our 2nd upstream server. It lets us show a prompt that uses tools
// from two servers, for example:
//   "List today's orders and save a short note about them."
//
// Notes are kept in memory. If the pod restarts, the notes are gone.
// That is fine for a demo server.

import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = Number(process.env.PORT || 3000);
const MCP_TOKEN = process.env.MCP_TOKEN || "";

// Our "database": a simple list in memory.
const notes = [];
let nextId = 1;

function reply(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Build an MCP server with all the notes tools.
function buildServer() {
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  server.registerTool(
    "add_note",
    {
      description: "Save a new team note.",
      inputSchema: { text: z.string().min(1).describe("The note text") },
    },
    async ({ text }) => {
      const note = { id: nextId++, text: text, created: new Date().toISOString() };
      notes.push(note);
      return reply(note);
    }
  );

  server.registerTool(
    "list_notes",
    { description: "List all saved team notes.", inputSchema: {} },
    async () => reply(notes)
  );

  server.registerTool(
    "delete_note",
    {
      description: "Delete a note by its ID.",
      inputSchema: { id: z.number().int().describe("Note ID") },
    },
    async ({ id }) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) throw new Error("No note with id " + id);
      notes.splice(index, 1);
      return reply({ deleted: id });
    }
  );

  // Same name as the "ping" tool on the other servers (name collision demo).
  server.registerTool(
    "ping",
    { description: "Check that the notes MCP server is alive.", inputSchema: {} },
    async () => reply({ server: "notes", ok: true, time: new Date().toISOString() })
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.post("/mcp", async (req, res) => {
  // Check the bearer token (only the gateway has it).
  if (MCP_TOKEN && req.headers.authorization !== "Bearer " + MCP_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (req, res) => res.status(405).json({ error: "Method not allowed" }));
app.delete("/mcp", (req, res) => res.status(405).json({ error: "Method not allowed" }));

app.listen(PORT, () => console.log("Notes MCP server is running on port " + PORT));
