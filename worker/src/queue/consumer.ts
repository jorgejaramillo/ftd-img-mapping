import { markProductCompleted, markProductError, markProductOriginalInfo } from "../db/queries";
import { extensionForFormat, PipelineError, processProductImage, type OutputFormat, type PipelineConfig } from "../services/imagePipeline";
import { buildR2Key, contentTypeForFormat, putProcessedImage } from "../services/r2";
import type { ProcessImageMessage } from "../types";

function configFromEnv(env: Env): PipelineConfig {
  const outputFormat = (env.OUTPUT_FORMAT as OutputFormat) ?? "jpeg";
  return {
    outputFormat,
    outputWidth: Number(env.OUTPUT_WIDTH ?? "1000"),
    outputHeight: Number(env.OUTPUT_HEIGHT ?? "1000"),
    productOccupancy: Number(env.PRODUCT_OCCUPANCY ?? "0.75"),
    backgroundColor: env.BACKGROUND_COLOR ?? "#FFFFFF",
    maxOriginalBytes: Number(env.MAX_ORIGINAL_IMAGE_BYTES ?? "15728640"),
    downloadTimeoutMs: Number(env.DOWNLOAD_TIMEOUT_MS ?? "10000"),
  };
}

export async function handleQueueBatch(batch: MessageBatch<ProcessImageMessage>, env: Env): Promise<void> {
  const config = configFromEnv(env);

  for (const message of batch.messages) {
    const { productId, sku, imageUrl } = message.body;

    try {
      const result = await processProductImage(env.IMAGES, imageUrl, config);

      await markProductOriginalInfo(env.DB, productId, result.original);

      const extension = extensionForFormat(config.outputFormat);
      const key = buildR2Key(sku, extension);
      await putProcessedImage(env.PRODUCT_IMAGES, key, result.finalBytes, contentTypeForFormat(config.outputFormat));

      await markProductCompleted(env.DB, productId, {
        finalR2Key: key,
        finalWidth: result.finalInfo.width,
        finalHeight: result.finalInfo.height,
        finalFormat: result.finalInfo.format,
        finalFilesize: result.finalInfo.fileSize,
      });

      message.ack();
    } catch (err) {
      const detail = err instanceof PipelineError ? `${err.code}: ${err.message}` : String(err);
      await markProductError(env.DB, productId, detail);
      message.retry();
    }
  }
}
