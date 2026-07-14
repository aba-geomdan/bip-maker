import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import obfuscator from "vite-plugin-javascript-obfuscator";
// GitHub Pages: https://aba-geomdan.github.io/bip-maker/
export default defineConfig({
  base: "/bip-maker/",
  plugins: [
    react(),
    obfuscator({
      apply: "build",
      include: [/\.js$/],
      exclude: [/node_modules/],
      debugger: false,
      options: {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.75,
        identifierNamesGenerator: "hexadecimal",
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        selfDefending: false,
      },
    }),
  ],
});
