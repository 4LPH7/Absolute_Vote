import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  base: "./", // relative asset paths: works at a domain root or any subpath
  envDir: "..", // read .env.local etc. from the repo root
  plugins: [react()],
  // ethers + React come to ~520 kB minified (~175 kB gzipped); warn only beyond that.
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 600 },
  // The Flask relayer (python api/index.py) runs on :5000 during local development.
  server: { proxy: { "/api": "http://127.0.0.1:5000" } },
});
