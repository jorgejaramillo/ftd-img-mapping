import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAccess } from "../middleware/auth";

export const identityRoutes = new Hono<AppEnv>();

identityRoutes.get("/me", requireAccess, (c) => {
  return c.json({ user: c.get("user") });
});
