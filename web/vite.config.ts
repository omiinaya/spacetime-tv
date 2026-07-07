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

        console.log("[inline-css] Post-processing", indexPath);

        // Collect all CSS <link> tags that point to local files
        const cssLinkRegex = /<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>/gi;
        const inlined: { fullLink: string; css: string }[] = [];
        let match;
        while ((match = cssLinkRegex.exec(html)) !== null) {
          const fullLink = match[0];
          const href = match[1];

          // Skip remote URLs (e.g. Google Fonts)
          if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
            console.log("[inline-css] SKIP - remote URL:", href);
            continue;
          }

          const cssPath = path.resolve(distDir, href.replace(/^\//, ""));
          console.log("[inline-css] Inlining", href, "→", cssPath);
          try {
            const css = readFileSync(cssPath, "utf-8");
            inlined.push({ fullLink, css });
            try { unlinkSync(cssPath); } catch {}
          } catch {
            console.log("[inline-css] SKIP - file not found:", cssPath);
          }
        }

        // Replace each <link> with <style> — reverse order to preserve indices
        for (const { fullLink, css } of inlined.reverse()) {
          html = html.replace(fullLink, `<style>${css}</style>`);
        }

        // Ensure styles are in <head> — move any <style> blocks that ended up after <script> or <link rel="modulepreload">
        const headCloseIdx = html.indexOf("</head>");
        if (headCloseIdx !== -1) {
          // Find all <style> blocks outside <head> and move them in
          const afterHead = html.slice(headCloseIdx + 7);
          const styleOutsideRegex = /<style>[\s\S]*?<\/style>/g;
          let styleMatch;
          const moved: string[] = [];
          while ((styleMatch = styleOutsideRegex.exec(afterHead)) !== null) {
            moved.push(styleMatch[0]);
          }
          if (moved.length > 0) {
            // Remove from after-head area
            let cleaned = afterHead;
            for (const s of moved) {
              cleaned = cleaned.replace(s, "");
            }
            // Insert into <head> before </head>
            html = html.slice(0, headCloseIdx) + moved.join("\n    ") + "\n" + html.slice(headCloseIdx);
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
