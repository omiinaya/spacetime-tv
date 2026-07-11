/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync, writeFileSync, unlinkSync } from "fs";

export default defineConfig({
  plugins: [
    tailwindcss({ inject: false }),
    react(),
    {
      name: "strip-crossorigin",
      closeBundle() {
        const indexPath = path.resolve(__dirname, "dist/index.html");
        let html = readFileSync(indexPath, "utf-8");
        html = html.replace(/\s+crossorigin(=["'][^"']*["'])?/g, "");
        writeFileSync(indexPath, html);
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("mpegts.js")) return "mpegts";
          if (id.includes("hls.js")) return "hls";
          if (id.includes("shaka-player")) return "shaka";
        },
      },
    },
  },
  server: {
    port: 5180,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8720",
        changeOrigin: true,
        ws: false,
        rewrite: (path) => path.replace(/^\/api/, "/api/v1"),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
