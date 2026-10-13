// mcp-endpoint.js
// This is the "MCP server" side of the gateway.
// MCP clients (Claude Code, Cursor, MCP Inspector, our chat agent)
// connect to ONE url: /mcp. They see the tools of every enabled server.
//
// How a tool call travels:
//   client --> gateway /mcp --> (check API key) --> find server by name prefix
//          --> upstream MCP server --> WooCommerce store --> back the same way
//   and we write one row to the audit log.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { listAllTools, getServerByName, getStatus, callUpstreamTool, SEPARATOR } from "./upstreams.js";
import { writeAudit } from "./audit.js";
import { now } from "./db.js";

// Make an error answer that MCP clients and models understand.
function errorResult(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}

// The tools one user can see, with names like "woocommerce__list_orders".
export function toolsForUser(user) {
  return listAllTools().map(({ server, tool }) => ({
    name: server + SEPARATOR + tool.name,
    // We put the server name in front, so people and models know where it comes from.
    description: "[" + server + "] " + (tool.description || "").slice(0, 1000),
    inputSchema: tool.inputSchema,
  }));
}

// Run one tool call for one user. Always writes to the audit log.
export async function callToolAsUser(user, via, fullName, args) {
  const startedAt = now();
  const startTime = Date.now();

  // "woocommerce__list_orders" -> server "woocommerce", tool "list_orders"
  const cut = fullName.indexOf(SEPARATOR);
  const serverName = cut > 0 ? fullName.slice(0, cut) : "-";
  const toolName = cut > 0 ? fullName.slice(cut + SEPARATOR.length) : fullName;

  // Helper to write the audit row and return the result.
  function finish(result, ok, error) {
    writeAudit({ user, via, server: serverName, tool: toolName, startedAt, durationMs: Date.now() - startTime, ok, error });
    return result;
  }

  const server = getServerByName(serverName);
  if (!server) return finish(errorResult("Unknown tool: " + fullName), false, "Unknown server");
  if (!server.enabled) return finish(errorResult("Server '" + serverName + "' is disabled"), false, "Server disabled");

  // Only allow tools that the server really has (from the last health check).
  const known = getStatus(server.id).tools.some((t) => t.name === toolName);
  if (!known) return finish(errorResult("Tool not available right now: " + fullName), false, "Tool not available");

  try {
    const result = await callUpstreamTool(server, toolName, args || {});
    const ok = !result.isError;
    const errorText = ok ? null : (result.content?.[0]?.text || "Tool error").slice(0, 300);
    return finish(result, ok, errorText);
  } catch (error) {
    return finish(errorResult("Call to '" + serverName + "' failed: " + error.message), false, error.message);
  }
}

// Build an MCP server object for one request, for one user.
function buildGatewayServer(user, via) {
  const server = new Server(
    { name: "team-mcp-gateway", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // tools/list -> all tools from all enabled servers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolsForUser(user) };
  });

  // tools/call -> route to the right upstream server
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return callToolAsUser(user, via, request.params.name, request.params.arguments);
  });

  return server;
}

// Express handler for POST /mcp. Login was checked before (requireMcpAuth).
// Stateless: a new server object for every request. This keeps things simple
// and lets us run many gateway pods later.
export async function handleMcpRequest(req, res) {
  const server = buildGatewayServer(req.user, req.via);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Gateway MCP error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  }
}
