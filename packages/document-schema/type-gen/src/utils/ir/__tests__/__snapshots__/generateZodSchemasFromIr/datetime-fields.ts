import { z } from 'zod';

export const EventSchema = z.object({
  timestamp: z.string().datetime(),
});
