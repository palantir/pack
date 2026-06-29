/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Reason a document channel subscription (data, presence, activity) failed.
 * UI can branch on this to decide how to react.
 */
export const ChannelErrorCode = {
  /** Client's max supported schema version is below the document's operational version. */
  CLIENT_VERSION_TOO_LOW: "clientVersionTooLow",
  /** Client's base revision is too far behind to sync. */
  REVISION_TOO_OLD: "revisionTooOld",
  /** Document's operational version was bumped; client must re-subscribe. */
  OPERATIONAL_VERSION_BUMPED: "operationalVersionBumped",
  /** Server-side internal error. */
  INTERNAL_ERROR: "internalError",
  /** Any other failure (transport error, or an unrecognized server code). */
  UNKNOWN: "unknown",
} as const;
export type ChannelErrorCode = typeof ChannelErrorCode[keyof typeof ChannelErrorCode];

/**
 * A typed error describing why a channel subscription failed.
 */
export interface ChannelError {
  readonly code: ChannelErrorCode;
  /** Server-assigned id for correlating this error with backend logs. Empty for client-side errors. */
  readonly errorInstanceId: string;
  /** Optional human-readable detail (e.g. for UNKNOWN/client-side errors). */
  readonly message?: string;
}

/**
 * Wraps an arbitrary thrown value (transport failure, client-side error) as a
 * ChannelError with code UNKNOWN.
 */
export function toUnknownChannelError(cause: unknown): ChannelError {
  return {
    code: ChannelErrorCode.UNKNOWN,
    errorInstanceId: "",
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

// Server (platform) error code strings → domain ChannelErrorCode.
const SERVER_ERROR_CODE_MAP: Record<string, ChannelErrorCode> = {
  CLIENT_VERSION_TOO_LOW: ChannelErrorCode.CLIENT_VERSION_TOO_LOW,
  REVISION_TOO_OLD: ChannelErrorCode.REVISION_TOO_OLD,
  DOCUMENT_TYPE_OPERATIONAL_VERSION_BUMPED: ChannelErrorCode.OPERATIONAL_VERSION_BUMPED,
  INTERNAL_ERROR: ChannelErrorCode.INTERNAL_ERROR,
};

/**
 * Maps a platform channel error (raw server code + instance id) to a domain
 * ChannelError. Unrecognized server codes collapse to ChannelErrorCode.UNKNOWN.
 */
export function toChannelError(serverCode: string, errorInstanceId: string): ChannelError {
  return {
    code: SERVER_ERROR_CODE_MAP[serverCode] ?? ChannelErrorCode.UNKNOWN,
    errorInstanceId,
  };
}
