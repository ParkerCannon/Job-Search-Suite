import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const projectRoot = process.cwd();

export default defineConfig({
  root: "static",
  base: "./",
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${projectRoot}/` }],
  },
  css: {
    postcss: path.join(projectRoot, "postcss.config.js"),
  },
  build: {
    outDir: "../dist-portable",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});
