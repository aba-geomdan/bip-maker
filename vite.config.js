import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: https://aba-geomdan.github.io/bip-maker/
export default defineConfig({
  base: "/bip-maker/",
  plugins: [react()],
});
