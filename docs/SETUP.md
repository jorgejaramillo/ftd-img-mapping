# Setup

Esta guía cubre lo que hace falta para pasar de "código listo" a una instancia
desplegada en Cloudflare. Nada de esto se ejecutó como parte del build —
son pasos manuales a cargo de quien despliegue.

## 1. Requisitos

- Node.js 20+
- Cuenta de Cloudflare con Workers, D1, R2, Queues e Images habilitados
- Cuenta de DataForSEO con credenciales (login/password)
- `npx wrangler login` ya autenticado contra la cuenta correcta

## 2. Instalar dependencias

```bash
npm install
```

## 3. Desarrollo local (sin crear nada en Cloudflare)

Wrangler simula D1, R2 y Queues localmente (estado en `worker/.wrangler/state`).

```bash
cp worker/.dev.vars.example worker/.dev.vars
# editar worker/.dev.vars con credenciales reales de DataForSEO

npm run db:migrate:local   # aplica worker/migrations/0001_init.sql en D1 local
npm run dev:worker         # wrangler dev, sirve API + queue consumer en :8787
npm run dev:frontend       # vite dev, con proxy de /api hacia :8787
```

Con esto se puede probar todo el flujo (import → asignación → búsqueda →
selección → procesar → resultados → descarga) sin tocar la cuenta real de
Cloudflare.

## 4. Crear los recursos reales en Cloudflare

Ejecutar desde `worker/`:

```bash
npx wrangler d1 create ftd-img-mapping-db
# copiar el database_id devuelto a worker/wrangler.jsonc (d1_databases[0].database_id)

npx wrangler r2 bucket create ftd-img-mapping-images

npx wrangler queues create image-processing
npx wrangler queues create image-processing-dlq
```

Habilitar **Cloudflare Images** para la cuenta desde el dashboard (Images →
Enable) — necesario para que el binding `IMAGES` funcione en producción.

Aplicar la migración en D1 remoto:

```bash
npm run db:migrate:remote
```

## 5. Secrets

```bash
cd worker
npx wrangler secret put DATAFORSEO_LOGIN
npx wrangler secret put DATAFORSEO_PASSWORD
```

## 6. Build + deploy

```bash
npm run build              # compila frontend/ a frontend/dist
cd worker && npx wrangler deploy
```

## 7. Habilitar Cloudflare Access (login)

No es configurable por código — se hace en el dashboard después del primer
deploy:

1. **Workers & Pages** → seleccionar el Worker `ftd-img-mapping`.
2. **Settings → Domains & Routes** → sobre la URL `*.workers.dev`, click
   **Enable Cloudflare Access**.
3. **Manage Cloudflare Access** → configurar la política: qué correos,
   dominio, o Google Workspace pueden entrar.

Una vez habilitado, el Worker recibe automáticamente la identidad del
usuario autenticado (`ctx.access.getIdentity()`), sin cambios de código.

## 8. Verificación realizada durante el build

Todo el flujo se probó de punta a punta contra `wrangler dev` (D1/R2/Queues
simulados localmente) y contra la API real de DataForSEO (con credenciales de
prueba, usando `location_code=2170` / Colombia): import de Excel (validación
de columnas, duplicados, filas vacías) → asignación de lote → búsqueda real en
DataForSEO → selección → cola de procesamiento → pipeline de imagen (descarga,
inspección, escalado a ~75% de ocupación, centrado con padding en canvas
1000×1000, WebP) → guardado en R2 → reproceso → descarga individual, ZIP y
CSV. La respuesta real de DataForSEO confirmó que:

- La imagen utilizable está en `items[].source_url` (no `image_url`), la
  página fuente en `items[].url`, y el dominio en `items[].subtitle` — el
  normalizador en `worker/src/services/dataforseo.ts` ya refleja esto.
- Solo `items[].type === "images_search"` son resultados de imagen reales;
  el resto (`carousel`, `related_searches`) se descarta.
- `location_code=2170` sí devuelve resultados de retailers colombianos
  (Olímpica, Carulla, Éxito, etc.) — confirma que el mecanismo de location
  funciona correctamente.

> **Nota**: la configuración por defecto se cambió después a Argentina
> (`DATAFORSEO_LOCATION_CODE=2032`, confirmado contra el listado oficial de
> DataForSEO) y `OUTPUT_FORMAT=jpeg`, alineado con el archivo real de
> "Imágenes Faltantes ARGENTINA" que usa este proyecto. El mecanismo de
> location/formato en sí ya estaba verificado con Colombia/WebP arriba.

Durante esta verificación se encontraron y corrigieron 3 bugs reales:
1. `processing/start` violaba la FK `products.processing_batch_id` por crear
   el registro en `processing_batches` después de referenciarlo.
2. Un producto marcado "sin imagen adecuada" y ya incluido en un lote
   procesado volvía a aparecer como pendiente indefinidamente
   (`getAssignedProducts` no excluía los ya vinculados a un `processing_batch_id`).
3. El normalizador de DataForSEO asumía nombres de campo incorrectos (ver arriba).

**Pendiente de verificar con datos propios**: la ocupación real (~70-75%) y el
comportamiento de `fit:"contain"` frente a productos que necesiten escalar
*hacia arriba* (el caso de prueba usado ya venía en el tamaño correcto o más
grande) — si una imagen pequeña no llega al 70-75% esperado, revisar el
parámetro `upscale` de Cloudflare Images.

## Vulnerabilidad conocida: `xlsx`

`npm audit` marca la librería `xlsx` (SheetJS) con una vulnerabilidad alta
conocida (ReDoS / prototype pollution) sin fix publicado en npm — SheetJS
distribuye las versiones parcheadas solo desde su propio CDN
(`https://cdn.sheetjs.com`), no desde el registro de npm. El riesgo real acá
es acotado (solo usuarios ya autenticados por Access suben archivos, en un
endpoint interno), pero si se quiere eliminarlo del todo: reemplazar la
dependencia `xlsx` de `worker/package.json` por el tarball publicado en el
CDN de SheetJS, o migrar a otra librería de parseo de Excel.

## Fuera de alcance de este build

- **Eliminación de fondo**: el pipeline v1 no remueve el fondo (ver
  `worker/src/services/imagePipeline.ts`, función `removeBackground`, que
  hoy es un passthrough). Para agregarlo: reemplazar esa función por una
  llamada a un proveedor externo (p. ej. remove.bg o Photoroom) que reciba
  la imagen original y devuelva una versión con fondo transparente — no
  requiere tocar el resto del pipeline.
- Roles de usuario, dashboard analítico, selección automática por IA,
  multi-organización — ver sección "Evitar inicialmente" del spec original.
