import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAccess } from "../middleware/auth";
import { ExcelValidationError, parseProductsFile } from "../services/excel";
import { generateId } from "../utils/ids";
import {
  getExistingSkus,
  getImport,
  insertImport,
  insertProducts,
  listImports,
  updateImportCounts,
} from "../db/queries";

export const importsRoutes = new Hono<AppEnv>();

importsRoutes.use("*", requireAccess);

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

  const existingSkus = await getExistingSkus(
    c.env.DB,
    parsed.rows.map((r) => r.sku),
  );

  const duplicateAgainstDb = parsed.rows.filter((r) => existingSkus.has(r.sku));
  const newRows = parsed.rows.filter((r) => !existingSkus.has(r.sku));

  await insertProducts(c.env.DB, importId, newRows);

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
  const imports = await listImports(c.env.DB);
  return c.json({ imports });
});

importsRoutes.get("/:id", async (c) => {
  const record = await getImport(c.env.DB, c.req.param("id"));
  if (!record) return c.json({ error: "not_found" }, 404);
  return c.json({ import: record });
});
