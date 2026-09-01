import type { AuthUser } from "./types";

// `Env` es un tipo ambiental global generado por `wrangler types` (ver
// worker-configuration.d.ts) a partir de los bindings declarados en wrangler.jsonc.
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
};
