import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";
import { ExcelValidationError, parseProductsFile } from "../services/excel";
import { generateId } from "../utils/ids";
import {
  clearUserProductData,
  getExistingSkus,
  getImport,
  insertImport,
  insertProducts,
  listImports,
  updateImportCounts,
} from "../db/queries";

export const importsRoutes = new Hono<AppEnv>();

importsRoutes.use("*", requireAuth);

importsRoutes.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return c.json(
      { error: "missing_file", message: "Debes adjuntar un archivo .csv o .xlsx en el campo 'file'" },
      400,
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["csv", "xlsx", "xls"].includes(extension)) {
    return c.json(
      { error: "invalid_extension", message: "Formato no soportado: usa un archivo .csv o .xlsx" },
      400,
    );
  }

  const buffer = await file.arrayBuffer();

  let parsed;
  try {
    parsed = parseProductsFile(buffer);
  } catch (err) {
    if (err instanceof ExcelValidationError) {
      return c.json({ error: "invalid_excel", message: err.message }, 400);
    }
    throw err;
  }

  const user = c.get("user");
  const importId = generateId("import");
  await insertImport(c.env.DB, { id: importId, filename: file.name, createdBy: user.email });

  // Duplicados solo contra el catálogo PROPIO: que otro usuario haya subido el
  // mismo archivo no debe vaciar este import.
  const existingSkus = await getExistingSkus(
    c.env.DB,
    user.email,
    parsed.rows.map((r) => r.sku),
  );

  const duplicateAgainstDb = parsed.rows.filter((r) => existingSkus.has(r.sku));
  const newRows = parsed.rows.filter((r) => !existingSkus.has(r.sku));

  await insertProducts(c.env.DB, importId, user.email, newRows);

  const duplicateRows = parsed.duplicateRows + duplicateAgainstDb.length;
  await updateImportCounts(c.env.DB, importId, {
    totalRows: parsed.totalRows,
    importedRows: newRows.length,
    skippedRows: parsed.skippedRows,
    duplicateRows,
  });

  return c.json({
    importId,
    totalRows: parsed.totalRows,
    importedRows: newRows.length,
    skippedRows: parsed.skippedRows,
    duplicateRows,
  });
});

importsRoutes.get("/", async (c) => {
  const imports = await listImports(c.env.DB, c.get("user").email);
  return c.json({ imports });
});

importsRoutes.get("/:id", async (c) => {
  const record = await getImport(c.env.DB, c.req.param("id"));
  // Un import ajeno se responde como inexistente: no se filtra ni su
  // existencia ni el nombre del archivo de otra cuenta.
  if (!record || record.created_by !== c.get("user").email) {
    return c.json({ error: "not_found", message: "Import no encontrado." }, 404);
  }
  return c.json({ import: record });
});

/** Borra el catálogo DEL USUARIO ACTUAL (sus productos, imports y lotes) para
 * empezar de cero. No toca usuarios/sesiones ni los datos de otras cuentas.
 * Las imágenes ya generadas quedan huérfanas en R2 (no se referencian desde
 * ningún lado, no afectan nada visible). */
importsRoutes.post("/clear", async (c) => {
  await clearUserProductData(c.env.DB, c.get("user").email);
  return c.json({ ok: true });
});
