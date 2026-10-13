# Production: deploy to a VPS with k3s

We use **the same Helm chart**. Only the values file is different: `values-prod.yaml`.

## What changes (only Helm values)

| Setting | values-local.yaml | values-prod.yaml | Why |
|---|---|---|---|
| `images.registry` / `tag` | `team-mcp` / `dev` | `ghcr.io/<you>/team-mcp-gateway` / `1.0.0` | VPS pulls images from a registry |
| `ingress.className` | `nginx` | `traefik` | k3s ships Traefik |
| `ingress.storeHost` / `dashboardHost` | `*.localtest.me` | your real domains | Real DNS |
| `ingress.tls` / `clusterIssuer` | `false` / none | `true` / `letsencrypt` | HTTPS with cert-manager |
| `ingress.controllerNamespace` | `ingress-nginx` | `kube-system` | NetworkPolicy must allow the controller |
| `storageClass` | default (`standard`) | `local-path` | k3s storage class |
| storage sizes | 2Gi | 10Gi | Real data |
| admin emails | example | yours | |

Secrets are **not** in the values files in either case. They are made by Helm at install time and kept
on every upgrade (`lookup`). The LLM key is a Secret you create.

## Steps

### 1. Server and DNS

- A VPS with 2 vCPU / 4 GB RAM or more (Ubuntu 24.04), ports 80 and 443 open.
- DNS A records: `store.example.com` and `dashboard.example.com` -> the VPS public IP.

### 2. Install k3s (it includes Traefik, local-path storage and a NetworkPolicy controller)

```bash
curl -sfL https://get.k3s.io | sh -
mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config && sudo chown $USER ~/.kube/config
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### 3. Install cert-manager and the Let's Encrypt issuer

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
kubectl -n cert-manager wait --for=condition=Available deploy --all --timeout=180s
# edit the email in the file first
kubectl apply -f scripts/cluster-issuer.yaml
```

### 4. Images

Push a tag; GitHub Actions builds all 5 images to `ghcr.io` ([.github/workflows/images.yml](../.github/workflows/images.yml)):

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Make the packages public in GitHub (or add an `imagePullSecret`).

### 5. Secrets and install

```bash
kubectl create namespace mcp
kubectl -n mcp create secret generic llm-secret --from-literal=LLM_API_KEY=<your-key>

# Edit values-prod.yaml first: domains, registry, emails.
helm install tmg helm/team-mcp-gateway -n mcp -f helm/team-mcp-gateway/values-prod.yaml --wait --timeout 15m
```

Open `https://dashboard.example.com`. Get the admin password:

```bash
kubectl -n mcp get secret app-secrets -o jsonpath="{.data.GATEWAY_ADMIN_PASSWORD}" | base64 -d; echo
```

## Upgrade

1. Change the code, push a new tag (for example `v1.0.1`) -> new images.
2. Upgrade, changing only the tag:

```bash
helm upgrade tmg helm/team-mcp-gateway -n mcp -f helm/team-mcp-gateway/values-prod.yaml \
  --set images.tag=1.0.1 --wait --timeout 15m
```

What happens:
- **Secrets stay the same** (the template reads the old Secret with `lookup`).
- **Volumes stay** (PVCs are not deleted by upgrades): store data, database, gateway data are safe.
- The **store setup Job runs again** (post-upgrade hook). Every step is safe to repeat. It also updates the
  store URL, so a domain change is just a values change.
- **Gateway and WordPress** use the `Recreate` strategy (one pod at a time on the volume): a few seconds of
  downtime. The MCP servers and dashboard do rolling updates.
- **Upgrading the store itself:** change `store.wordpress.image` to a newer tag. WooCommerce can be
  updated from wp-admin or with `wp plugin update woocommerce` in the setup Job.
- **Upgrading the database:** change `store.mariadb.image`. Take a backup first (below).

## Rollback

```bash
helm -n mcp history tmg           # list revisions
helm -n mcp rollback tmg <rev> --wait
```

We tested this on Kind: rollback from revision 2 to 1 restored the old Deployment spec, and a new
`helm upgrade` moved forward again (revision 4), with the same Secrets and the same data.

**Careful:** Helm rolls back Kubernetes objects, **not data**. If a new version changed the database
(for example a WooCommerce DB update or a new gateway column), rolling back the code does not undo that.
So before a risky upgrade, take a backup:

```bash
# Store database
kubectl -n mcp exec mariadb-0 -- sh -c 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" wordpress' > store-backup.sql
# Gateway database
kubectl -n mcp cp $(kubectl -n mcp get pod -l app=gateway -o name | cut -d/ -f2):/data/gateway.db gateway-backup.db
```

Our gateway DB changes are additive (new columns only), so older gateway code still runs on a newer DB.
