# Small Node.js image (Node 24 has SQLite built in)
FROM node:24-alpine

WORKDIR /app

# Install packages first (cached by Docker)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy our code
COPY src ./src

# The database file lives here. In Kubernetes this is a persistent volume.
ENV DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data

# Run as the normal "node" user (id 1000), not as root.
# We use the number, so Kubernetes can check it is not root (runAsNonRoot).
USER 1000

EXPOSE 4000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
