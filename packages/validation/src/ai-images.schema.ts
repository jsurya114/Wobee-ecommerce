import { z } from "zod";

export const AI_IMAGE_ANGLES = ["FRONT", "BACK", "SIDE", "DETAIL"] as const;

export const requestAiImagesSchema = z.object({
  sourceMediaId: z.string().uuid("Invalid media id"),
  angles: z.array(z.enum(AI_IMAGE_ANGLES)).min(1, "Choose at least one angle").max(4),
});
export type RequestAiImagesInput = z.infer<typeof requestAiImagesSchema>;
