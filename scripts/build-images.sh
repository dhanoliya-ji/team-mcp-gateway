#!/bin/sh
# Build our 5 images and put them inside the Kind cluster.
# Usage: sh scripts/build-images.sh [tag]     (default tag: dev)
set -e
TAG=${1:-dev}
NODE=mcp-control-plane   # the Kind node container (cluster name "mcp")

for NAME in woo-mcp-server notes-mcp-server utils-mcp-server gateway dashboard; do
  echo "== Building team-mcp/$NAME:$TAG"
  docker build -q -t team-mcp/$NAME:$TAG ./$NAME
done

# We copy images straight into the node's containerd.
# ("kind load docker-image" can fail with Docker's multi-platform image store,
#  so we save only the linux/amd64 version, which always works.)
for IMAGE in \
  team-mcp/woo-mcp-server:$TAG team-mcp/notes-mcp-server:$TAG team-mcp/utils-mcp-server:$TAG \
  team-mcp/gateway:$TAG team-mcp/dashboard:$TAG \
  wordpress:6.8-php8.3-apache wordpress:cli-php8.3 mariadb:11.4
do
  echo "== Loading $IMAGE into Kind"
  docker image inspect $IMAGE > /dev/null 2>&1 || docker pull -q $IMAGE
  docker save --platform linux/amd64 $IMAGE | docker exec -i $NODE ctr --namespace=k8s.io images import --platform linux/amd64 -
done
echo "All images are in the cluster."
