import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../env";
import { generateSessionId, sessionExpiryFromNow, verifyPassword } from "../services/auth";
import { createSession, deleteSession, getUserByEmail } from "../db/queries";
import { SESSION_COOKIE_NAME, requireAuth } from "../middleware/auth";

export const authRoutes = new Hono<AppEnv>();

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", message: "Email y contraseña son obligatorios" }, 400);
  }

  const user = await getUserByEmail(c.env.DB, parsed.data.email);
  const validPassword = user ? await verifyPassword(parsed.data.password, user.password_hash, user.password_salt) : false;

  if (!user || !validPassword) {
    return c.json({ error: "invalid_credentials", message: "Correo o contraseña incorrectos" }, 401);
  }

  const sessionId = generateSessionId();
  const expiresAt = sessionExpiryFromNow();
  await createSession(c.env.DB, { id: sessionId, userId: user.id, expiresAt });

  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  return c.json({ user: { email: user.email } });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId) {
    await deleteSession(c.env.DB, sessionId);
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});
