import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// base relative : le build fonctionne aussi bien à la racine que sous /<repo>/ (GitHub Pages).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appVersion = env.VITE_APP_VERSION || process.env.npm_package_version || "dev";

  return {
    base: "./",
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [react()],
    server: {
      port: 5173,
    },
    build: {
      outDir: "dist",
    },
  };
});
