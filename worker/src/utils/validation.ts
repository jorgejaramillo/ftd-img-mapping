import { z } from "zod";

export const selectImageSchema = z.union([
  z.object({
    imageUrl: z.string().url(),
    sourceUrl: z.string().url(),
  }),
  z.object({
    noSuitableImage: z.literal(true),
  }),
]);

export type SelectImageInput = z.infer<typeof selectImageSchema>;

export const reprocessSchema = z.object({
  imageUrl: z.string().url(),
  sourceUrl: z.string().url(),
});

export type ReprocessInput = z.infer<typeof reprocessSchema>;
