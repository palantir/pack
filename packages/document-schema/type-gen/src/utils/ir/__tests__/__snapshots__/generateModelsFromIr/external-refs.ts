import type {
  DocumentSchema,
  Model,
} from '@palantir/pack.document-schema.model-types';
import { Metadata } from '@palantir/pack.document-schema.model-types';
import type { Event } from './types.js';
import { EventSchema } from './schema.js';

export interface EventModel extends Model<Event, typeof EventSchema> {}
export const EventModel: EventModel = {
  __type: {} as Event,
  zodSchema: EventSchema,
  [Metadata]: {
    externalRefFieldTypes: {
      documentRef: 'docRef',
      userRef: 'userRef',
    },
    name: 'Event',
  },
};

export const DocumentModel = {
  Event: EventModel,
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

export type DocumentModel = typeof DocumentModel;
