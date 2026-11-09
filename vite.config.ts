import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// GitHub Pages project site: https://joaocarlosgm.github.io/Hackers_D-egua/
// Assets and QR links use this base; navigation remains client-side via hashes.
export default defineConfig({ plugins: [react()], base: "/Hackers_D-egua/", build: { sourcemap: false } });
