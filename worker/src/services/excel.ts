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

/** Un identificador que Excel mostró tal cual: solo dígitos, sin exponente ni
 * separadores. Incluye los ceros a la izquierda de un formato "0000012345". */
const PLAIN_DIGITS = /^\d+$/;

/** Entero sin notación científica. `String(7.509552829099e12)` ya da los 13
 * dígitos, pero toFixed(0) lo deja explícito y cubre valores más grandes. */
function numberToPlainString(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
    return value.toFixed(0);
  }
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/**
 * Toma el valor de una celda combinando las DOS lecturas de SheetJS, porque
 * ninguna sirve sola para identificadores:
 *
 * - `raw:false` devuelve el texto formateado. Conserva ceros a la izquierda,
 *   pero un EAN numérico con formato "General" se lee como Excel lo DIBUJA:
 *   7509552829099 llega como "7.50955E+12". Dos EAN distintos de la misma
 *   marca colapsan al mismo string y la búsqueda sale con basura.
 * - `raw:true` devuelve el número real (sin exponente al pasarlo a texto),
 *   pero pierde el relleno de ceros de un formato personalizado.
 *
 * Regla: si la celda es numérica se usa el texto formateado SOLO cuando son
 * puros dígitos (o sea, no cayó en notación científica); si no, el número.
 */
function normalizedValue(
  formattedRow: Record<string, unknown>,
  rawRow: Record<string, unknown>,
  columnName: string,
): string {
  const key = Object.keys(formattedRow).find((k) => k.trim().toUpperCase() === columnName);
  if (!key) return "";

  const formatted = String(formattedRow[key] ?? "").trim();
  const rawCell = rawRow[key];

  if (typeof rawCell === "number" && Number.isFinite(rawCell)) {
    return PLAIN_DIGITS.test(formatted) ? formatted : numberToPlainString(rawCell);
  }

  return formatted;
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
  // Se lee dos veces (texto formateado y valor crudo) porque para SKU/EAN
  // ninguna de las dos alcanza sola — ver normalizedValue().
  const formattedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });

  if (formattedRows.length === 0) {
    throw new ExcelValidationError("El archivo no tiene filas");
  }

  const headerKeys = Object.keys(formattedRows[0]).map((k) => k.trim().toUpperCase());
  for (const col of REQUIRED_COLUMNS) {
    if (!headerKeys.includes(col)) {
      throw new ExcelValidationError(`Falta la columna requerida: ${col}`);
    }
  }

  const rows: ParsedProductRow[] = [];
  const seenSkus = new Set<string>();
  let skippedRows = 0;
  let duplicateRows = 0;

  for (let i = 0; i < formattedRows.length; i++) {
    const formattedRow = formattedRows[i];
    const rawRow = rawRows[i] ?? {};

    const ean = normalizedValue(formattedRow, rawRow, "EAN");
    const productName = normalizedValue(formattedRow, rawRow, "PRODUCT_NAME");
    const sku = normalizedValue(formattedRow, rawRow, "SKU");

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

  return { rows, totalRows: formattedRows.length, skippedRows, duplicateRows };
}
