// url-check.js
// When an admin adds a server URL, we check it first.
// This stops "server-side request forgery" (SSRF): tricking the gateway
// into calling places it should not, like the cloud metadata service
// (169.254.169.254) which can give out cloud passwords.
//
// Note: we DO allow normal cluster-internal names like
// "http://woo-mcp-server:3000/mcp", because our own MCP servers live there.

import dns from "node:dns/promises";
import net from "node:net";

// Is this IP address one we never want to call?
function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true;               // localhost (the gateway itself)
    if (a === 169 && b === 254) return true;  // link-local + cloud metadata
    if (a === 0) return true;                 // "this network"
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;      // localhost
  if (lower.startsWith("fe80:")) return true;               // link-local
  if (lower.startsWith("fd00:ec2")) return true;            // AWS metadata (IPv6)
  if (lower.startsWith("::ffff:")) return isBlockedIp(lower.slice(7));
  return false;
}

// Throws an error with a clear message if the URL is not allowed.
export async function checkServerUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("This is not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal") throw new Error("Cloud metadata address is not allowed");

  // Find all IPs for the name, and check each one.
  let addresses = [];
  try {
    addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    throw new Error("Cannot find this host name (DNS error)");
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) throw new Error("This address is not allowed: " + address);
  }
}
