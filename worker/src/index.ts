import { app } from "./app";
import { handleQueueBatch } from "./queue/consumer";
import type { ProcessImageMessage } from "./types";

export default {
  fetch: app.fetch,
  queue: (batch, env) => handleQueueBatch(batch, env),
} satisfies ExportedHandler<Env, ProcessImageMessage>;
