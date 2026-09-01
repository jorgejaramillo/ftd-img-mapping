import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

interface AccessIdentity {
  email?: string;
  name?: string;
}

interface AccessBinding {
  getIdentity: () => Promise<AccessIdentity | null>;
}

/**
 * Cloudflare Access, una vez habilitado sobre la ruta de este Worker (ver
 * docs/SETUP.md), adjunta un `access` al ExecutionContext con getIdentity().
 * Es la forma moderna de leer la identidad autenticada sin validar a mano el
 * JWT del header Cf-Access-Jwt-Assertion.
 *
 * En desarrollo local, el bloque `access.dev` de wrangler.jsonc simula esta
 * identidad automáticamente al correr `wrangler dev`.
 */
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  const access = (c.executionCtx as unknown as { access?: AccessBinding }).access;

  if (!access) {
    return c.json(
      { error: "unauthorized", message: "Cloudflare Access no autenticó esta petición" },
      401,
    );
  }

  const identity = await access.getIdentity();
  if (!identity?.email) {
    return c.json({ error: "forbidden" }, 403);
  }

  c.set("user", { email: identity.email, name: identity.name });
  await next();
});
