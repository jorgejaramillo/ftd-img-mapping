import { zipSync, type Zippable } from "fflate";

export interface ZipEntry {
  filename: string;
  bytes: Uint8Array;
}

// Zip en memoria (síncrono): el lote máximo es de ~100 imágenes ya optimizadas
// (WebP/PNG a 1000x1000), muy por debajo del límite de memoria de un Worker,
// así que no hace falta la variante streaming de fflate para este volumen.
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const files: Zippable = {};
  for (const entry of entries) {
    files[entry.filename] = entry.bytes;
  }
  return zipSync(files, { level: 6 });
}
