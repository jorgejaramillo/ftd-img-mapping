import * as XLSX from "xlsx";
import { generateId } from "../utils/ids";

export interface ParsedProductRow {
  id: string;
  ean: string;
  productName: string;
  sku: string;
}

export interface ExcelParseResult {
  rows: ParsedProductRow[];
  totalRows: number;
  skippedRows: number;
  duplicateRows: number;
}

const REQUIRED_COLUMNS = ["EAN", "PRODUCT_NAME", "SKU"] as const;

export class ExcelValidationError extends Error {}

function normalizedValue(row: Record<string, unknown>, columnName: string): string {
  const key = Object.keys(row).find((k) => k.trim().toUpperCase() === columnName);
  if (!key) return "";
  return String(row[key] ?? "").trim();
}

// Acepta tanto .csv como .xlsx/.xls: XLSX.read() detecta el formato a partir
// de los bytes (firma ZIP para xlsx, texto plano para CSV).
export function parseProductsFile(buffer: ArrayBuffer): ExcelParseResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new ExcelValidationError("El archivo no tiene hojas");
  }

  const sheet = workbook.Sheets[firstSheetName];
  // raw:false conserva el texto original de cada celda (incluyendo ceros a la
  // izquierda en SKU/EAN) en vez de dejar que SheetJS los convierta a number,
  // lo que corrompería silenciosamente identificadores como "0012345".
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

  if (raw.length === 0) {
    throw new ExcelValidationError("El archivo no tiene filas");
  }

  const headerKeys = Object.keys(raw[0]).map((k) => k.trim().toUpperCase());
  for (const col of REQUIRED_COLUMNS) {
    if (!headerKeys.includes(col)) {
      throw new ExcelValidationError(`Falta la columna requerida: ${col}`);
    }
  }

  const rows: ParsedProductRow[] = [];
  const seenSkus = new Set<string>();
  let skippedRows = 0;
  let duplicateRows = 0;

  for (const rawRow of raw) {
    const ean = normalizedValue(rawRow, "EAN");
    const productName = normalizedValue(rawRow, "PRODUCT_NAME");
    const sku = normalizedValue(rawRow, "SKU");

    if (!ean && !productName && !sku) {
      skippedRows += 1;
      continue;
    }

    if (!sku) {
      skippedRows += 1;
      continue;
    }

    if (seenSkus.has(sku)) {
      duplicateRows += 1;
      continue;
    }

    seenSkus.add(sku);
    rows.push({ id: generateId("prod"), ean, productName, sku });
  }

  return { rows, totalRows: raw.length, skippedRows, duplicateRows };
}
