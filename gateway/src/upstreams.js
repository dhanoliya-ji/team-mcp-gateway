// upstreams.js
// This file is the "MCP client" side of the gateway.
// It connects to every upstream MCP server, checks if it is alive,
// remembers its tools, and sends tool calls to it.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { db } from "./db.js";
import { config } from "./config.js";
import { decrypt } from "./security.js";

// Live status of each server, kept in memory.
// serverId -> { status: "Connected" | "Unreachable" | "Disabled", tools: [...], error, checkedAt }
const statusById = new Map();

// Tool names look like "<server>__<tool>", for example "woocommerce__list_orders".
// This is how we handle two servers that have a tool with the same name:
// "woocommerce__ping", "notes__ping" and "utils__ping" are all different.
export const SEPARATOR = "__";

// ---------- Database helpers ----------

export function getAllServers() {
  return db.prepare("SELECT * FROM servers ORDER BY id").all();
}

export function getServerByName(name) {
  return db.prepare("SELECT * FROM servers WHERE name = ?").get(name);
}

// ---------- Connect to one upstream ----------

// Build the headers with the upstream credential.
// The credential is decrypted only here, on the server, right before use.
// It is never sent to the browser or to an MCP client.
function headersFor(server) {
  if (!server.secret_encrypted || server.auth_type === "none") return {};
  const secret = decrypt(server.secret_encrypted);
  if (server.auth_type === "bearer") return { Authorization: "Bearer " + secret };
  if (server.auth_type === "header") return { [server.auth_header_name]: secret };
  return {};
}

// Open a new MCP client connection to one upstream server.
async function openClient(server) {
  const client = new Client({ name: "team-mcp-gateway", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: headersFor(server) },
  });
  // "timeout" makes the SDK give up if the server does not answer in time.
  await client.connect(transport, { timeout: config.connectTimeoutMs });
  return client;
}

// ---------- Health check ----------

// Check one server: connect, list its tools, save the result.
export async function checkServer(server) {
  if (!server.enabled) {
    statusById.set(server.id, { status: "Disabled", tools: [], error: null, checkedAt: new Date().toISOString() });
    return;
  }

  let client = null;
  try {
    client = await openClient(server);
    const result = await client.listTools(undefined, { timeout: config.connectTimeoutMs });
    statusById.set(server.id, {
      status: "Connected",
      tools: result.tools,
      error: null,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    // The server is down, slow, or said "no". We save a clear reason.
    statusById.set(server.id, {
      status: "Unreachable",
      tools: [],
      error: explainError(error),
      checkedAt: new Date().toISOString(),
    });
  } finally {
    if (client) client.close().catch(() => {});
  }
}

// Check all servers at the same time.
// Promise.allSettled waits for all, even if some fail.
// So one dead server never stops the check of the others.
export async function checkAllServers() {
  await Promise.allSettled(getAllServers().map((server) => checkServer(server)));
}

// Run the check again and again in the background.
export function startHealthChecks() {
  checkAllServers();
  setInterval(checkAllServers, config.healthCheckEveryMs);
}

export function getStatus(serverId) {
  return statusById.get(serverId) || { status: "Unknown", tools: [], error: null, checkedAt: null };
}

export function forgetServer(serverId) {
  statusById.delete(serverId);
}

// ---------- Tools ----------

// All tools from all enabled + connected servers, with the server name in front.
export function listAllTools() {
  const tools = [];
  for (const server of getAllServers()) {
    if (!server.enabled) continue;
    const status = getStatus(server.id);
    if (status.status !== "Connected") continue;
    for (const tool of status.tools) {
      tools.push({ server: server.name, tool: tool });
    }
  }
  return tools;
}

// Call one tool on one upstream server.
// Throws an error with a clear message if anything goes wrong.
export async function callUpstreamTool(server, toolName, args) {
  let client = null;
  try {
    client = await openClient(server);
    return await client.callTool({ name: toolName, arguments: args }, undefined, {
      timeout: config.callTimeoutMs,
    });
  } catch (error) {
    throw new Error(explainError(error));
  } finally {
    if (client) client.close().catch(() => {});
  }
}

// Turn low-level errors into short, clear text for people.
function explainError(error) {
  const text = String(error?.message || error);
  if (text.includes("timed out") || text.includes("Request timed out")) return "Timeout: the server did not answer in time";
  if (text.includes("ECONNREFUSED")) return "Connection refused: the server is not running";
  if (text.includes("ENOTFOUND") || text.includes("EAI_AGAIN")) return "DNS error: the server name was not found";
  if (text.includes("401")) return "Unauthorized: the server rejected our credential";
  if (text.includes("fetch failed")) return "Network error: could not reach the server (" + (error?.cause?.code || "unknown") + ")";
  return text.slice(0, 300);
}
