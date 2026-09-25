/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
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

import type { PackAppInternal } from "@palantir/pack.core";
import type {
  DocumentId,
  DocumentMetadata,
  DocumentRef,
  DocumentSchema,
  Model,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { createDocRef } from "@palantir/pack.state.core";
import type { FoundryEventService, SubscriptionId } from "@palantir/pack.state.foundry-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import { FoundryDocumentService } from "../FoundryDocumentService.js";

/* eslint-disable @typescript-eslint/unbound-method */

const mockLogger = {
  child: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

const mockApp = {
  getModule: vi.fn().mockReturnValue({
    getDocumentSchemaOperationalVersion: vi.fn().mockReturnValue(1),
  }),
  config: {
    logger: mockLogger,
    osdkClient: {},
  },
} as unknown as PackAppInternal;

const testSchema = {
  [Metadata]: { version: 1 },
} as const satisfies DocumentSchema;

const testModel = {
  __type: {} as Record<string, never>,
  zodSchema: {} as Model["zodSchema"],
  [Metadata]: { name: "TestModel" },
} as unknown as Model<Record<string, never>>;

const baseMetadata: DocumentMetadata = {
  documentTypeName: "TestType",
  name: "Test Document",
  security: {
    discretionary: {},
    mandatory: {},
  },
};

class TestFoundryDocumentService extends FoundryDocumentService {
  setMetadata(docRef: DocumentRef, metadata: DocumentMetadata): void {
    const { internalDoc } = this.getCreateInternalDoc(docRef);
    internalDoc.metadata = metadata;
  }
}

describe("Foundry document presence support", () => {
  let eventService: MockProxy<FoundryEventService>;
  let service: TestFoundryDocumentService;
  let docRef: DocumentRef;

  beforeEach(() => {
    eventService = mock();
    eventService.subscribeToPresenceUpdates.mockResolvedValue("presence-sub" as SubscriptionId);
    eventService.publishCustomPresence.mockResolvedValue();
    service = new TestFoundryDocumentService(mockApp, {}, eventService);
    docRef = createDocRef(mockApp, "test-doc" as DocumentId, testSchema);
  });

  it("does not subscribe or publish when presence is explicitly unsupported", () => {
    service.setMetadata(docRef, { ...baseMetadata, presenceSupported: false });

    const unsubscribe = service.onPresence(docRef, vi.fn());
    service.updateCustomPresence(docRef, testModel, {});

    expect(eventService.subscribeToPresenceUpdates).not.toHaveBeenCalled();
    expect(eventService.publishCustomPresence).not.toHaveBeenCalled();
    unsubscribe();
  });

  it.each([true, undefined])(
    "preserves presence behavior when presenceSupported is %s",
    presenceSupported => {
      service.setMetadata(docRef, { ...baseMetadata, presenceSupported });

      service.onPresence(docRef, vi.fn());
      service.updateCustomPresence(docRef, testModel, {});

      expect(eventService.subscribeToPresenceUpdates).toHaveBeenCalledOnce();
      expect(eventService.publishCustomPresence).toHaveBeenCalledOnce();
    },
  );
});
