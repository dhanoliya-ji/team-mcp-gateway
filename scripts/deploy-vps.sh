#!/bin/sh
# deploy-vps.sh
# Run this ON the VPS (Ubuntu), from the repo folder, as root:
#
#   sudo sh scripts/deploy-vps.sh <LLM_API_KEY>
#
# It does everything:
#   1. install k3s (Kubernetes) and Helm
#   2. install cert-manager (free HTTPS certificates from Let's Encrypt)
#   3. make the LLM Secret
#   4. install our Helm chart with values-prod.yaml
#
# Domains: we use sslip.io, a free DNS service. "store.1.2.3.4.sslip.io" points
# to the IP 1.2.3.4. So we need no domain purchase. To use your own domain,
# set STORE_HOST and DASHBOARD_HOST before running this script.
# The script is safe to run again (it skips or updates what already exists).
set -e

LLM_API_KEY="$1"
if [ -z "$LLM_API_KEY" ]; then
  echo "Usage: sudo sh scripts/deploy-vps.sh <LLM_API_KEY>"
  exit 1
fi

IP=$(curl -s https://ipv4.icanhazip.com)
STORE_HOST=${STORE_HOST:-store.$IP.sslip.io}
DASHBOARD_HOST=${DASHBOARD_HOST:-dashboard.$IP.sslip.io}
echo "Public IP: $IP"
echo "Store:     https://$STORE_HOST"
echo "Dashboard: https://$DASHBOARD_HOST"

echo "== 1. k3s and Helm"
if ! command -v k3s > /dev/null; then
  curl -sfL https://get.k3s.io | sh -
fi
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
until kubectl get nodes 2> /dev/null | grep -q " Ready"; do echo "  waiting for k3s..."; sleep 5; done
if ! command -v helm > /dev/null; then
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

echo "== 2. cert-manager"
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
kubectl -n cert-manager wait --for=condition=Available deploy --all --timeout=300s
# The cert-manager webhook may need a few more seconds, so we try again until it works.
until kubectl apply -f scripts/cluster-issuer.yaml; do echo "  waiting for cert-manager webhook..."; sleep 5; done

echo "== 3. LLM Secret"
kubectl create namespace mcp --dry-run=client -o yaml | kubectl apply -f -
kubectl -n mcp create secret generic llm-secret --from-literal=LLM_API_KEY="$LLM_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "== 4. Install the app (first time takes a few minutes)"
helm upgrade --install tmg helm/team-mcp-gateway -n mcp \
  -f helm/team-mcp-gateway/values-prod.yaml \
  --set ingress.storeHost="$STORE_HOST" \
  --set ingress.dashboardHost="$DASHBOARD_HOST" \
  --wait --timeout 20m

echo
echo "Done!"
echo "Store:     https://$STORE_HOST"
echo "Dashboard: https://$DASHBOARD_HOST   (admin@example.com)"
echo "Dashboard admin password:"
kubectl -n mcp get secret app-secrets -o jsonpath="{.data.GATEWAY_ADMIN_PASSWORD}" | base64 -d; echo
