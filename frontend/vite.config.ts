import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Durante `npm run dev` en frontend/, las peticiones a /api se reenvían al
// Worker corriendo con `wrangler dev` (puerto por defecto 8787). En producción,
// el mismo Worker sirve el build de esta SPA (frontend/dist) y la API juntos.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
