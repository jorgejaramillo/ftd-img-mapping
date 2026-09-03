import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { getValidSessionUser } from "../db/queries";

export const SESSION_COOKIE_NAME = "session";

/** Login propio (email/password en D1 + sesión por cookie) — reemplaza el
 * flujo anterior basado en Cloudflare Access. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) {
    return c.json({ error: "unauthorized", message: "No hay sesión activa" }, 401);
  }

  const user = await getValidSessionUser(c.env.DB, sessionId);
  if (!user) {
    return c.json({ error: "unauthorized", message: "Sesión inválida o expirada" }, 401);
  }

  c.set("user", { email: user.email });
  await next();
});
