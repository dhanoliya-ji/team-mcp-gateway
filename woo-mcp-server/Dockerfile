# Small Node.js image
FROM node:24-alpine

WORKDIR /app

# First copy only package files, then install.
# Docker caches this step, so builds are faster.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Then copy our code
COPY src ./src

# Run as the normal "node" user, not as root (safer)
USER node

EXPOSE 3000
CMD ["node", "src/index.js"]
