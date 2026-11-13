import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.pem",
        "*.crt",
        "**/.git/**",
        "**/Keu.xlsx",
        "**/.dev.vars*",
        "**/.initial-credentials*",
        "**/private/**",
        "**/.wrangler/**",
        "**/*.private.*",
        "**/docs/**",
        "**/prototype/**",
      ],
    },
  },
  build: { manifest: true },
});
