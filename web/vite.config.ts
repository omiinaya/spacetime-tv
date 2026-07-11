/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync, writeFileSync } from "fs";

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
    }],
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
    exclude: ["e2e/**", "node_modules/**"  
    {
      name: "extract-inline-tailwind",
      closeBundle() {
        const indexPath = path.resolve(__dirname, "dist/index.html");
        let html = readFileSync(indexPath, "utf-8");
        
        // Find all <style> blocks
        const styleRegex = /<style>([\s\S]*?)<\/style>/g;
        let match;
        const extracted = [];
        
        while ((match = styleRegex.exec(html)) !== null) {
          const css = match[1];
          // Only extract blocks larger than 10KB (the Tailwind block)
          if (css.length > 10000) {
            extracted.push({ full: match[0], css, index: match.index });
          }
        }
        
        // Replace large inline style blocks with link to external CSS file
        for (let i = extracted.length - 1; i >= 0; i--) {
          const { full, css, index } = extracted[i];
          const filename = `tailwind.${index}.css`;
          const outputPath = path.resolve(__dirname, "dist", "assets", filename);
          writeFileSync(outputPath, css, "utf-8");
          html = html.replace(full, `<link rel="stylesheet" href="/assets/${filename}" />`);
        }
        
        writeFileSync(indexPath, html);
      },
    },

],
  },
});
