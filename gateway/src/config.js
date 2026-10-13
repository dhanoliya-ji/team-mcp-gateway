// config.js
// All settings for the gateway, in one place.
// Every value comes from an environment variable.
// In Kubernetes, secret values (passwords, keys) come from a Secret.

const port = Number(process.env.PORT || 4000);

export const config = {
  port: port,

  // Folder where the SQLite database file is saved (a persistent volume in Kubernetes).
  dataDir: process.env.DATA_DIR || "./data",

  // Used to encrypt upstream server credentials before we save them.
  encryptionKey: process.env.ENCRYPTION_KEY || "",

  // The first admin user. Created on the first start only.
  adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD || "",

  // Time limits (milliseconds). A slow server must not block everything.
  connectTimeoutMs: Number(process.env.CONNECT_TIMEOUT_MS || 5000),
  callTimeoutMs: Number(process.env.CALL_TIMEOUT_MS || 20000),

  // How often we check if each upstream server is alive.
  healthCheckEveryMs: Number(process.env.HEALTH_CHECK_EVERY_MS || 15000),

  // The chat agent talks to an LLM with an OpenAI-style API.
  // This works with Groq, Google Gemini, OpenRouter, Ollama and more.
  llm: {
    baseUrl: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "openai/gpt-oss-120b",
  },

  // The chat agent uses the gateway's own MCP endpoint, like any other client.
  selfMcpUrl: "http://127.0.0.1:" + port + "/mcp",

  // Servers to add on the very first start (for example the WooCommerce one).
  // JSON list like: [{ "name": "woocommerce", "url": "http://...", "tokenEnv": "WOO_MCP_TOKEN" }]
  seedServers: JSON.parse(process.env.SEED_SERVERS || "[]"),
};
