// Vite builds our React app.
// In local dev ("npm run dev"), we send /api and /mcp to the gateway on port 4000.
// In Kubernetes, the Ingress does this job instead.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4000",
      "/mcp": "http://localhost:4000",
    },
  },
});
