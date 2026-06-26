/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          mpegts: ["mpegts.js"],
          hls: ["hls.js"],
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
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
