import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relative : le build fonctionne aussi bien à la racine que sous /<repo>/ (GitHub Pages).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
