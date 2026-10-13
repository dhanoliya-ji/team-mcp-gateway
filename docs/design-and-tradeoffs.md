# System design and tradeoffs

## 1. The parts and their jobs

| Part | Job | Tech |
|---|---|---|
| **Store** | WordPress + WooCommerce, the real shop | `wordpress:7.0-php8.3-apache`, MariaDB 11.4 StatefulSet |
| **Store setup Job** | Installs WordPress + WooCommerce, turns on Cash on delivery, makes the REST API key | `wordpress:cli`, Helm post-install/post-upgrade hook |
| **woo-mcp-server** | Our own MCP server. Turns MCP tool calls into WooCommerce REST API calls | Node.js, official MCP TypeScript SDK, Express |
| **notes-mcp-server, utils-mcp-server** | Two more upstream MCP servers (notes; time/currency/slow test tool) | Same stack |
| **gateway** | MCP **client** to every upstream + MCP **server** at `/mcp`; users, API keys, audit log, chat agent | Node.js 24, built-in `node:sqlite`, MCP SDK |
| **dashboard** | Admin and member UI | React 19 + Vite, served by unprivileged nginx |

Everything runs in one namespace (`mcp`), installed by **one Helm chart**.

## 2. Architecture choices (and why)

- **Node.js + the official MCP SDK everywhere.** One language for all servers, the SDK handles the
  protocol details (JSON-RPC, initialize, Streamable HTTP), and the code stays short.
- **Streamable HTTP in stateless mode.** Each POST to `/mcp` creates a fresh MCP server object and is
  answered on the same request (`enableJsonResponse: true`). No session state on the server, so any pod
  can answer any request, and the code is easy to read. Tradeoff: no server-to-client push
  (for example `tools/list_changed` notifications); clients must re-list tools to see changes.
- **The WooCommerce MCP server uses the WooCommerce REST API** (`/wc/v3/...`) with a consumer key and
  secret. Why: it is the official, stable API for products and orders, it works over the network so the
  MCP server is its own pod (own image, own limits, own NetworkPolicy), and it does not need shell access
  into the WordPress pod like WP-CLI would. We call it with `?rest_route=` so it works without pretty
  permalinks. WooCommerce only accepts key+secret on HTTPS, so inside the cluster we send
  `X-Forwarded-Proto: https`; the WordPress image trusts this header. This is OK because the WordPress
  service is reachable only from the ingress controller and the woo-mcp-server pod (NetworkPolicy).
- **WP-CLI for setup only.** A Helm hook Job installs WooCommerce and writes the REST API key into the
  `woocommerce_api_keys` table (hashed, the same way WooCommerce does it), using values from the
  Kubernetes Secret. So no clicking in wp-admin, and the key is never in Git.
- **SQLite for the gateway.** Users, key hashes, servers and the audit log are small. SQLite on a
  persistent volume needs no extra database pod. Tradeoff: one gateway replica (see section 6).
- **Fixed, simple names** (`wordpress`, `mariadb`, `gateway`...). One release per namespace keeps the
  templates easy to read.

## 3. Tool aggregation and routing

1. On start, the gateway registers the first servers from `SEED_SERVERS` (WooCommerce first). Their
   tokens come from the Secret and are stored **encrypted** in SQLite.
2. Every 15 seconds (and right after an admin change, or "Check now"), the gateway connects to each
   enabled server **in parallel** (`Promise.allSettled`), runs `initialize` + `tools/list`, and keeps the
   result in memory: status `Connected` / `Unreachable` (with a reason) / `Disabled`, plus its tools.
3. `tools/list` on the gateway returns the cached tools of every **enabled and connected** server that
   the user is allowed to use. It never waits for an upstream, so a slow server cannot slow down listing.
4. `tools/call` with name `woocommerce__list_orders` is split at the first `__` into server
   `woocommerce` and tool `list_orders`. The gateway checks: server exists, is enabled, the tool exists,
   the user's role may use it. Then it opens an MCP client connection with the server's credential,
   calls the tool with a timeout, and writes one audit row.

### Name collisions

**Scheme: every tool is renamed to `<server-name>__<tool-name>`.** Server names may only use `a-z`,
`0-9` and `-` (no `_`), so the split at the first `__` is always correct. Our three servers all have a
tool called `ping` on purpose: they become `woocommerce__ping`, `notes__ping`, `utils__ping`. The tool
description also starts with `[server-name]`, so the model knows where a tool comes from.

## 4. Failure handling

| Problem | What happens |
|---|---|
| Upstream pod is dead | Health check fails -> `Unreachable` + reason (e.g. "Connection refused" or "Timeout"). Its tools leave the list. Other servers are not touched, because every check and call is separate |
| Upstream is slow | Connect timeout 5 s, call timeout 20 s (`CALL_TIMEOUT_MS`). The caller gets a clear error: `Call to 'utils' failed: Timeout: the server did not answer in time` |
| Upstream returns an error | Passed back as an MCP tool error (`isError: true`); audit row marked failed with the message |
| Server disabled | Tools leave the list; direct calls get "Server 'x' is disabled" |
| Store down | woo-mcp-server tools return the WooCommerce error text (15 s timeout) |

## 5. The chat agent

The dashboard sends the chat history to `POST /api/chat`. The gateway then:

1. Opens an MCP client to **its own `/mcp` endpoint** with the user's **login token**, so the agent is just
   another MCP client acting as that user (same tool list, same permissions, same audit log, `via = chat`).
2. Gives the tools to the LLM (OpenAI-style `tools` format; default Groq `llama-3.3-70b-versatile`).
3. Loop (max 8 rounds): if the LLM asks for tools, call them through the gateway, add the results,
   ask again. If it answers with text, return the answer and the list of tool calls to the UI.

The LLM key is in a Kubernetes Secret (`llm-secret`), read as an env var, never sent to the browser.

## 6. What changes for production

| Thing | Local (Kind) | Production (k3s on a VPS) |
|---|---|---|
| Domains | `*.localtest.me` -> 127.0.0.1 | Real DNS A records to the VPS IP |
| Ingress | ingress-nginx, `className: nginx` | Traefik (built into k3s), `className: traefik` |
| TLS | none | cert-manager + Let's Encrypt (`ingress.tls: true`, `clusterIssuer`) |
| Storage class | Kind default `standard` | k3s `local-path` (or a cloud block storage class), bigger sizes |
| Images | built locally, loaded into Kind | built by GitHub Actions, pulled from `ghcr.io` |
| Secrets | generated by Helm at install, kept on upgrade | same; or create them from a secret manager / Sealed Secrets before install |
| NetworkPolicy namespace | `ingress-nginx` | `kube-system` (where Traefik runs) |

All of these are **Helm values only**: see `values-local.yaml` and `values-prod.yaml`.

## 7. Tradeoffs and what we would do next

- **One gateway replica**, because SQLite lives on a ReadWriteOnce volume. The MCP endpoint itself is
  stateless, so to scale we would move the data to Postgres and run 2+ replicas behind the Service.
- **New upstream connection per call.** Simple and robust (no stale connections), costs one extra
  round-trip (`initialize`). A connection pool would be faster.
- **Tool list is cached for up to 15 s.** Fast and safe, but a new tool can take a few seconds to show up.
- **Notes server keeps notes in memory.** It is a demo upstream; a restart clears them.
- **Invite = one-time password** shown to the admin. A real system would email an invite link.
