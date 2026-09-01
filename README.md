# ftd-img-mapping

Herramienta interna para importar listados de productos desde Excel, buscar imágenes en Google Images vía DataForSEO, seleccionar manualmente la mejor imagen por producto y procesarla (centrado en canvas 1000×1000, optimizada) guardándola en Cloudflare R2.

Monorepo con dos workspaces:

- `worker/` — Cloudflare Worker (Hono): API, consumer de la cola de procesamiento y hosting del frontend compilado.
- `frontend/` — SPA en React + Vite.

Para poner en marcha el entorno local y desplegar, ver [`docs/SETUP.md`](docs/SETUP.md).
