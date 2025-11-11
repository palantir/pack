// Generated TypeScript interfaces from document schema
import type { DocumentRef, MediaRef, ObjectRef, UserRef } from "@palantir/pack.schema";

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

