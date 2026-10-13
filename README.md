# team-mcp-gateway

A WooCommerce store and a **team MCP gateway**, all running on Kubernetes.

An admin connects MCP servers once in a dashboard. Then every team member uses
all of them through **one MCP URL and one personal API key**, from Claude Code,
Cursor, MCP Inspector, or from the chat agent inside the dashboard.

```
                         Ingress (the only public doors)
         store.localtest.me                     dashboard.localtest.me
                |                           /            |             \
                v                        /api           /mcp            /
          +-----------+              +------------------------+     +-----------+
 shopper->| WordPress |              |        gateway         |     | dashboard |
          |+WooCommerce|<--REST API--| - MCP server (/mcp)    |     | (React)   |
          +-----+-----+     |        | - MCP client to every  |     +-----------+
                |           |        |   upstream server      |
          +-----v-----+  +--+-------+| - API keys, audit log  |
          |  MariaDB  |  | woo-mcp- ||   chat agent (LLM loop)|
          +-----------+  | server   |+-----------+------------+
                         +----^-----+            |
                              |    only the gateway may call the MCP servers
                              +-------------+----+----------------+
                                            |                     |
                                     +------v-------+     +-------v------+
                                     | notes-mcp-   |     | utils-mcp-   |
                                     | server       |     | server       |
                                     +--------------+     +--------------+
```

## What is in this repo

| Folder | What it is |
|---|---|
| [woo-mcp-server/](woo-mcp-server/) | **Our own** WooCommerce MCP server (Node.js, MCP over Streamable HTTP). Tools: `list_products`, `create_product`, `list_orders`, `get_order`, `update_order_status`, `ping` |
| [notes-mcp-server/](notes-mcp-server/) | 2nd upstream: a tiny team-notes MCP server (`add_note`, `list_notes`, `delete_note`, `ping`) |
| [utils-mcp-server/](utils-mcp-server/) | 3rd upstream: helper tools (`get_current_time`, `convert_currency`, `slow_task`, `ping`) |
| [gateway/](gateway/) | Gateway backend: one MCP endpoint, dashboard API, API keys, audit log, chat agent |
| [dashboard/](dashboard/) | React dashboard (servers, members, API keys, audit log, chat) |
| [helm/team-mcp-gateway/](helm/team-mcp-gateway/) | The Helm chart + `values-local.yaml` + `values-prod.yaml` |
| [scripts/](scripts/) | Kind config, build/load images script, smoke test |
| [docs/](docs/) | System design and tradeoffs, threat model, VPS/production guide |

## Local setup (Kind)

### 1. Tools you need

- Docker Desktop (running)
- [kind](https://kind.sigs.k8s.io/), [kubectl](https://kubernetes.io/docs/tasks/tools/), [helm](https://helm.sh/) (v3 or v4)
- Node.js 22+ (only for running the smoke test script)
- Free ports 80 and 443 on your computer

On Windows: `winget install Kubernetes.kind Helm.Helm Kubernetes.kubectl`

### 2. Create the cluster and the ingress controller

```bash
kind create cluster --config scripts/kind-config.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/kind/deploy.yaml
kubectl -n ingress-nginx wait --for=condition=Ready pod -l app.kubernetes.io/component=controller --timeout=180s
```

### 3. Build the images and load them into Kind

```bash
sh scripts/build-images.sh
```

### 4. (Optional, for the chat agent) add your LLM API key as a Secret

Any OpenAI-style API works. The default is **Groq** (free tier): get a key at https://console.groq.com/keys

```bash
kubectl create namespace mcp
kubectl -n mcp create secret generic llm-secret --from-literal=LLM_API_KEY=<your-key>
```

To use Google Gemini instead, also add these to the install command:
`--set llm.baseUrl=https://generativelanguage.googleapis.com/v1beta/openai --set llm.model=gemini-2.5-flash`

### 5. Install everything with Helm

```bash
helm install tmg helm/team-mcp-gateway -n mcp --create-namespace \
  -f helm/team-mcp-gateway/values-local.yaml --wait --timeout 15m
```

The first install takes a few minutes: a setup Job installs WordPress and WooCommerce with WP-CLI.

### 6. Open it

| What | URL |
|---|---|
| Store | http://store.localtest.me |
| Store admin | http://store.localtest.me/wp-admin (user `admin`) |
| Dashboard | http://dashboard.localtest.me (user `admin@example.com`) |
| MCP endpoint | http://dashboard.localtest.me/mcp |

**Local domain approach:** `localtest.me` is a public DNS name where **every** sub-name points to
`127.0.0.1`. Kind forwards ports 80/443 on your computer to the ingress controller. So you do not edit
your hosts file at all. (If your network blocks this, add `127.0.0.1 store.localtest.me dashboard.localtest.me`
to your hosts file.)

Passwords are made at install time and live only in the `app-secrets` Secret:

```bash
# Dashboard admin password
kubectl -n mcp get secret app-secrets -o jsonpath="{.data.GATEWAY_ADMIN_PASSWORD}" | base64 -d; echo
# WordPress admin password
kubectl -n mcp get secret app-secrets -o jsonpath="{.data.WP_ADMIN_PASSWORD}" | base64 -d; echo
```

### 7. Quick check

```bash
bash scripts/smoke-test.sh
```

## How to use it

### Place an order in the store

1. Open http://store.localtest.me and click a product (or open the **Shop** page).
2. Click **Add to cart**, then **View cart** and **Proceed to checkout**.
3. Fill in the address. Choose **Cash on delivery**. Click **Place order**.
4. Open http://store.localtest.me/wp-admin -> **WooCommerce -> Orders**. The order is there.

### Team members and API keys

1. Log in to the dashboard as admin. Open **Members** and **Invite** a member.
   You get a one-time password. Give it to the member.
2. The member logs in, opens **API Keys**, and clicks **Generate my key**.
   The key is shown **one time only** (we store only its hash).
3. Admins can revoke any key. Members can revoke their own keys.

### Connect an external MCP client (Claude Code, Cursor, MCP Inspector)

You need only the gateway URL and your own key. You never see the upstream credentials.

**Claude Code:**

```bash
claude mcp add --transport http team-gateway http://dashboard.localtest.me/mcp \
  --header "Authorization: Bearer <your-api-key>"
```

Then in Claude Code ask: *"What orders came in today?"*, or a two-server prompt:
*"List today's orders and save a short summary of them as a team note."*

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "team-gateway": {
      "url": "http://dashboard.localtest.me/mcp",
      "headers": { "Authorization": "Bearer <your-api-key>" }
    }
  }
}
```

**MCP Inspector:** run `npx @modelcontextprotocol/inspector`, choose transport **Streamable HTTP**,
URL `http://dashboard.localtest.me/mcp`, and add the header `Authorization: Bearer <your-api-key>`.

### Use the chat agent

Open **Chat** in the dashboard and try:

- *"Create a product called Blue Mug with price 15"* -> it appears in the store.
- *"What orders came in today?"*
- *"What is the total of today's orders in EUR?"* (uses `woocommerce` + `utils`)

Under each answer you see which tools were called. The agent acts as **you**, so the calls are in the
audit log under your email.

### Admin: servers

- **MCP Servers** page: status (Connected / Unreachable / Disabled), the reason when unreachable, and the tools.
- **+ Add MCP server**: name, URL and optional credential (bearer token or custom header).
- **Edit / Disable / Remove** each server. **Click a tool** to lock it to admins only.

## Definition of done: how to show each step

| Step | How |
|---|---|
| Order in store, visible in WP admin | "Place an order" above |
| Chat (user A): create product | Chat: "Create a product called Demo Lamp with price 30" |
| Chat (user A): today's orders | Buy Demo Lamp in the store, then ask "What orders came in today?" |
| External client (user B) | Claude Code / Inspector with user B's key; list tools; ask the orders question |
| Two-server prompt | "List today's orders and save a summary as a team note" (woocommerce + notes) |
| Revoke B's key | API Keys -> Revoke. B's next call gets `401 API key was revoked` |
| Disable a server | MCP Servers -> Disable on `notes`. Tools disappear (reconnect the client to refresh its list) |
| Kill an upstream pod | `kubectl -n mcp scale deploy/notes-mcp-server --replicas=0` (or `kubectl -n mcp delete pod -l app=notes-mcp-server`). Dashboard shows **Unreachable** with the reason; WooCommerce tools still work |
| Audit log | Audit Log page: user, via, server, tool, time, duration, result |

## Production (VPS with k3s)

Same chart, different values file: see [docs/production-vps.md](docs/production-vps.md).

## Docs

- [System design and tradeoffs](docs/design-and-tradeoffs.md)
- [Threat model](docs/threat-model.md)
- [Production / VPS guide, upgrades and rollback](docs/production-vps.md)
- Full PDF guide: [docs/team-mcp-gateway-guide.pdf](docs/team-mcp-gateway-guide.pdf)

## Stand-out items we did

| Item | Where |
|---|---|
| **Tool permissions** (2): admin can lock tools; members do not see them and are rejected if they call them | [gateway/src/upstreams.js](gateway/src/upstreams.js), [gateway/src/mcp-endpoint.js](gateway/src/mcp-endpoint.js), Servers page |
| **Security hardening** (6): SSRF check on server URLs, upstream credentials encrypted at rest (AES-256-GCM), deny-by-default NetworkPolicies (incl. egress for MCP servers), all our containers non-root with read-only root filesystem, WordPress and MariaDB also non-root | [gateway/src/url-check.js](gateway/src/url-check.js), [gateway/src/security.js](gateway/src/security.js), [networkpolicies.yaml](helm/team-mcp-gateway/templates/networkpolicies.yaml) |
| **Observability** (8, partly): clear reason why an upstream is unreachable or why a call failed, in the dashboard and audit log | [gateway/src/upstreams.js](gateway/src/upstreams.js) |
| **Upgrades and rollback** (9): documented and tested `helm upgrade` / `helm rollback`; Secrets are kept across upgrades | [docs/production-vps.md](docs/production-vps.md) |
| **Production-like deploy** (1): `values-prod.yaml` for k3s + Traefik + cert-manager TLS, images built by GitHub Actions | [values-prod.yaml](helm/team-mcp-gateway/values-prod.yaml), [.github/workflows/images.yml](.github/workflows/images.yml) |
