import { z } from 'zod';

export const ContainerSchema = z.object({
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
});
