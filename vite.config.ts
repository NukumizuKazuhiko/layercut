import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths: Tauri serves the bundled frontend over a custom
  // asset protocol whose origin root is not the filesystem root, so Vite's
  // default absolute "/assets/..." URLs 404 and the app renders a blank
  // window. "./assets/..." resolves correctly in BOTH the web build and the
  // Tauri bundle.
  base: "./",
  resolve: {
    // PaperScript in paper-full evaluates generated code during module load.
    // The editor uses only the JavaScript API, which works under Tauri's CSP.
    alias: [{ find: /^paper$/, replacement: "paper/dist/paper-core.js" }],
  },
  plugins: [react()],
  server: {
    port: 5173,
    watch: { ignored: ["**/src-tauri/target/**"] },
  },
});
