// woo-api.js
// This file talks to the WooCommerce store.
// We use the WooCommerce REST API (normal HTTP + JSON).
//
// Why the REST API?
//   - It is the official way to read and change products and orders.
//   - It works over the network, so our MCP server can live in its own pod.
//   - WP-CLI would need to run inside the WordPress pod, which is harder.

// All settings come from environment variables.
// In Kubernetes, the key and secret come from a Secret (never from code).
const WOO_URL = process.env.WOO_URL || "http://wordpress";
const WOO_KEY = process.env.WOO_CONSUMER_KEY || "";
const WOO_SECRET = process.env.WOO_CONSUMER_SECRET || "";

// How long we wait for the store before we give up (in milliseconds).
const TIMEOUT_MS = 15000;

// Make one request to the WooCommerce REST API.
// path:   for example "/wc/v3/products"
// method: "GET", "POST" or "PUT"
// query:  extra URL params, for example { per_page: 10 }
// body:   data to send (for POST and PUT)
export async function wooRequest(method, path, query = {}, body = null) {
  // We use "?rest_route=" instead of "/wp-json/".
  // This works even when WordPress "pretty links" are not set up.
  const url = new URL(WOO_URL + "/");
  url.searchParams.set("rest_route", path);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }

  // Basic auth = "key:secret" in base64.
  const basicAuth = Buffer.from(WOO_KEY + ":" + WOO_SECRET).toString("base64");

  const response = await fetch(url, {
    method: method,
    headers: {
      "Authorization": "Basic " + basicAuth,
      "Content-Type": "application/json",
      // WooCommerce only allows key + secret on HTTPS.
      // Inside the cluster we talk plain HTTP, so we tell WordPress
      // "the original request was HTTPS". The WordPress Docker image
      // trusts this header. This is safe because the store service is
      // only reachable inside the cluster (see NetworkPolicy).
      "X-Forwarded-Proto": "https",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();

  // If the store says "error", we throw a clear message.
  if (!response.ok) {
    throw new Error("WooCommerce error " + response.status + ": " + text.slice(0, 300));
  }

  return JSON.parse(text);
}
