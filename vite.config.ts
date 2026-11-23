import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// GitHub Pages project site: https://joaocarlosgm.github.io/Hackers_D-egua/
// Assets and QR links use this base; navigation remains client-side via hashes.
export default defineConfig({
  plugins: [react()],
  base: "/Hackers_D-egua/",
  build: { sourcemap: false },
  // Somente DEV: o terminal Docker permanece local e nunca vira backend do GitHub Pages.
  server: {
    proxy: {
      "/ctf-lab": {
        target: "http://127.0.0.1:4100",
        changeOrigin: true,
        ws: true,
        rewrite: (url) => url.replace(/^\/ctf-lab/, ""),
      },
    },
  },
});
