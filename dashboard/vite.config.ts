import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      components: path.resolve(__dirname, "./src/components"),
      lib: path.resolve(__dirname, "./src/lib"),
      contexts: path.resolve(__dirname, "./src/contexts"),
      types: path.resolve(__dirname, "./src/types"),
    },
  },
  server: {
    port: 3002,
    open: true,
  },
  build: {
    outDir: "build",
    sourcemap: true,
  },
});
