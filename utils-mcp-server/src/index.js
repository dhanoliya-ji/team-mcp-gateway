// utils-mcp-server
// A very small MCP server with helper tools.
// It is our 3rd upstream server.
//   - get_current_time: what time is it in a time zone
//   - convert_currency: change money from one currency to another
//   - slow_task:        waits some seconds (to test gateway timeouts)
//   - ping:             same name as on the other servers (collision demo)

import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = Number(process.env.PORT || 3000);
const MCP_TOKEN = process.env.MCP_TOKEN || "";

// Fixed demo rates: how much 1 unit is worth in US dollars.
// (A real server would call a live rates API.)
const USD_VALUE = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  INR: 0.012,
  JPY: 0.0067,
};

function reply(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function buildServer() {
  const server = new McpServer({ name: "utils", version: "1.0.0" });

  server.registerTool(
    "get_current_time",
    {
      description: "Get the current date and time in a time zone.",
      inputSchema: {
        timezone: z.string().optional().describe("Time zone like 'Asia/Kolkata'. Default is UTC."),
      },
    },
    async ({ timezone }) => {
      const zone = timezone || "UTC";
      const text = new Date().toLocaleString("en-GB", { timeZone: zone });
      return reply({ timezone: zone, now: text });
    }
  );

  server.registerTool(
    "convert_currency",
    {
      description: "Convert money between USD, EUR, GBP, INR and JPY (fixed demo rates).",
      inputSchema: {
        amount: z.number().describe("How much money"),
        from: z.enum(Object.keys(USD_VALUE)).describe("Currency to convert from"),
        to: z.enum(Object.keys(USD_VALUE)).describe("Currency to convert to"),
      },
    },
    async ({ amount, from, to }) => {
      // First change to USD, then from USD to the target.
      const inUsd = amount * USD_VALUE[from];
      const result = inUsd / USD_VALUE[to];
      return reply({ amount, from, to, result: Math.round(result * 100) / 100 });
    }
  );

  server.registerTool(
    "slow_task",
    {
      description: "A test tool that waits some seconds before it answers.",
      inputSchema: {
        seconds: z.number().min(0).max(120).describe("How many seconds to wait"),
      },
    },
    async ({ seconds }) => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return reply({ waited: seconds });
    }
  );

  server.registerTool(
    "ping",
    { description: "Check that the utils MCP server is alive.", inputSchema: {} },
    async () => reply({ server: "utils", ok: true, time: new Date().toISOString() })
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.post("/mcp", async (req, res) => {
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

app.listen(PORT, () => console.log("Utils MCP server is running on port " + PORT));
