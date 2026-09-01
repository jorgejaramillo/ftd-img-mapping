import type { ImageCandidate } from "../types";

// Forma real confirmada contra el endpoint Live Advanced de DataForSEO para
// Google Images (verificado con una llamada real, no solo con la documentación
// pública). `result[0].items` mezcla varios tipos de entradas — un carousel de
// marca, resultados "related_searches", y los resultados de imagen reales bajo
// type "images_search" — solo estos últimos traen una imagen de producto y su
// página fuente utilizables.
interface DataForSeoImageItem {
  type: string;
  rank_group?: number;
  title?: string;
  subtitle?: string;
  url?: string;
  source_url?: string;
  encoded_url?: string;
}

interface DataForSeoTaskResult {
  status_code: number;
  status_message: string;
  result?: Array<{ items?: DataForSeoImageItem[] }>;
}

interface DataForSeoResponse {
  status_code: number;
  status_message: string;
  tasks?: DataForSeoTaskResult[];
}

export class DataForSeoError extends Error {}

export interface SearchImagesInput {
  ean: string;
  productName: string;
  locationCode: number;
  languageCode: string;
  login: string;
  password: string;
}

function buildKeyword(ean: string, productName: string): string {
  // El nombre va entre comillas (frase exacta) para acotar la coincidencia al
  // texto literal del producto; el EAN queda suelto porque es un solo token
  // (comillas no aportan nada ahí). Se limpian comillas propias del nombre
  // para no romper la sintaxis de frase exacta de Google.
  const namePart = productName.replace(/"/g, "").trim();
  const eanPart = ean.trim();
  return [eanPart, namePart ? `"${namePart}"` : ""].filter(Boolean).join(" ");
}

export async function searchGoogleImages(input: SearchImagesInput): Promise<ImageCandidate[]> {
  const keyword = buildKeyword(input.ean, input.productName);

  const credentials = btoa(`${input.login}:${input.password}`);

  const response = await fetch("https://api.dataforseo.com/v3/serp/google/images/live/advanced", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        keyword,
        location_code: input.locationCode,
        language_code: input.languageCode,
      },
    ]),
  });

  if (!response.ok) {
    throw new DataForSeoError(`DataForSEO respondió HTTP ${response.status}`);
  }

  const data = (await response.json()) as DataForSeoResponse;
  const taskResult = data.tasks?.[0];

  if (!taskResult || taskResult.status_code >= 40000) {
    throw new DataForSeoError(taskResult?.status_message ?? "Respuesta inválida de DataForSEO");
  }

  const items = taskResult.result?.[0]?.items ?? [];
  const imageItems = items.filter(
    (item): item is DataForSeoImageItem & { source_url: string } =>
      item.type === "images_search" && Boolean(item.source_url),
  );

  // Devuelve TODOS los resultados de imagen que trajo DataForSEO (hasta ~100
  // en una sola llamada, ya pagada): el llamador decide cuántos mostrar y
  // pagina sobre este mismo pool sin pedir una consulta nueva a DataForSEO.
  return imageItems.map((item, index) => ({
    position: item.rank_group ?? index + 1,
    imageUrl: item.source_url,
    sourceUrl: item.url ?? item.source_url,
    title: item.title ?? "",
    domain: item.subtitle ?? "",
    width: null,
    height: null,
    fileSize: null,
    format: null,
    thumbnailUrl: item.encoded_url ?? null,
  }));
}
