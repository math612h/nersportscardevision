import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Electron loads files via file://, so absolute base paths break.
// `base: "./"` is required to make assets resolve correctly.
export default defineConfig({
  plugins: [react()],
  base: "./",
  root: path.resolve(__dirname, "src"),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
