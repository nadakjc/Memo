import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: {
      // Don't trigger rebuild on Rust-side changes.
      ignored: ["**/src-tauri/**"],
    },
  },
});
