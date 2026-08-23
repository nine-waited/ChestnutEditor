import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@chestnut/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@chestnut/core": path.resolve(__dirname, "../../packages/core/src"),
      "@chestnut/plugin-sdk": path.resolve(__dirname, "../../packages/plugin-sdk/src"),
      "@chestnut/storage-adapters": path.resolve(__dirname, "../../packages/storage-adapters/src"),
      "@tauri-apps/plugin-clipboard-manager": path.resolve(
        __dirname,
        "node_modules/@tauri-apps/plugin-clipboard-manager",
      ),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        pinImage: path.resolve(__dirname, "pin-image.html"),
      },
    },
  },
});
