import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";

export const identityRoutes = new Hono<AppEnv>();

identityRoutes.get("/me", requireAuth, (c) => {
  return c.json({ user: c.get("user") });
});
