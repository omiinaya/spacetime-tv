/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync, writeFileSync, unlinkSync } from "fs";

export default defineConfig({
  plugins: [
    tailwindcss(),
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
    {
      name: "inline-css",
      closeBundle() {
        const distDir = path.resolve(__dirname, "dist");
        const indexPath = path.resolve(distDir, "index.html");
        let html = readFileSync(indexPath, "utf-8");

        // Log a snippet to verify the hook runs
        console.log("[inline-css] Post-processing", indexPath);

        const cssLinkRegex = /<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>/gi;
        let match;
        while ((match = cssLinkRegex.exec(html)) !== null) {
          const fullLink = match[0];
          const cssPath = path.resolve(distDir, match[1].replace(/^\//, ""));
          console.log("[inline-css] Inlining", match[1], "→", cssPath);
          try {
            const css = readFileSync(cssPath, "utf-8");
            html = html.replace(fullLink, `<style>${css}</style>`);
            try { unlinkSync(cssPath); } catch {}
          } catch {
            console.log("[inline-css] SKIP - file not found:", cssPath);
          }
        }

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
