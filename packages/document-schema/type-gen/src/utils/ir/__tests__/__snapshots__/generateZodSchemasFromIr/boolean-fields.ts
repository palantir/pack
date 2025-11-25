import { z } from 'zod';

export const FeatureSchema = z.object({
  enabled: z.boolean(),
  isPublic: z.boolean().optional(),
  flags: z.array(z.boolean()),
});
