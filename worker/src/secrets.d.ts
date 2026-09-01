// Los secrets (wrangler secret put / .dev.vars) no aparecen en el `Env`
// generado por `wrangler types` a partir de wrangler.jsonc, así que se
// amplían acá vía declaration merging con la interfaz global `Env`.
interface Env {
  DATAFORSEO_LOGIN: string;
  DATAFORSEO_PASSWORD: string;
}
