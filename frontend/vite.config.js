import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Le dev server Vite proxifie /api vers Flask (docker compose ou `python wsgi.py` en local).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
  build: {
    outDir: "dist",
  },
});
