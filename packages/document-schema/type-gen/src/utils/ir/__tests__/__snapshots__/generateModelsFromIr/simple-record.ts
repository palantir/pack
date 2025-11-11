import type {
  DocumentSchema,
  Model,
} from '@palantir/pack.document-schema.model-types';
import { Metadata } from '@palantir/pack.document-schema.model-types';
import type { Person } from './types.js';
import { PersonSchema } from './schema.js';

export interface PersonModel extends Model<Person, typeof PersonSchema> {}
export const PersonModel: PersonModel = {
  __type: {} as Person,
  zodSchema: PersonSchema,
  [Metadata]: {
    name: 'Person',
  },
};

export const DocumentModel = {
  Person: PersonModel,
  [Metadata]: {
    version: 1,
  },
} as const satisfies DocumentSchema;

export type DocumentModel = typeof DocumentModel;
