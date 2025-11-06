// Generated TypeScript interfaces from document schema
import type { DocumentRef, MediaRef, ObjectRef, UserRef } from "@pack/document-schema-model-types";

/**
 * A record containing all reference types
 */
export interface Document {
  readonly id: string;
  readonly docRef: DocumentRef;
  readonly userRef: UserRef;
  readonly objectRef: ObjectRef;
  readonly mediaRef: MediaRef;
  readonly optionalDocRef?: DocumentRef;
  readonly docRefArray: readonly DocumentRef[];
  readonly userRefArray: readonly UserRef[];
}

