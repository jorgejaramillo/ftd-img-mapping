import { Hono } from "hono";
import type { AppEnv } from "./env";
import { identityRoutes } from "./routes/identity";
import { importsRoutes } from "./routes/imports";
import { productsRoutes } from "./routes/products";
import { processingRoutes } from "./routes/processing";
import { downloadsRoutes } from "./routes/downloads";

export const app = new Hono<AppEnv>();

app.route("/api", identityRoutes);
app.route("/api/imports", importsRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/processing", processingRoutes);
app.route("/api", downloadsRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});
