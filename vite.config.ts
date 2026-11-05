import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Production is served at https://hackerspaidegua.com/ (not a repository subpath).
// All routes remain hash routes; assets and QR links use this same root base.
export default defineConfig({ plugins: [react()], base: "/" });
