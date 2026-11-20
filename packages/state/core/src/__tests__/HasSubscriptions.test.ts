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

import type { PackAppInternal } from "@palantir/pack.core";
import type {
  DocumentRef,
  DocumentSchema,
  Model,
  RecordId,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { DOCUMENT_SERVICE_MODULE_KEY } from "../DocumentServiceModule.js";
import type { BaseYjsDocumentService } from "../service/BaseYjsDocumentService.js";
import { getStateModule } from "../types/StateModule.js";
import { createTestApp } from "./testUtils.js";

interface User {
  id: string;
}

const userSchema = z.object({ id: z.string() });

const UserModel: Model<User, typeof userSchema> = {
  __type: {} as User,
  zodSchema: userSchema,
  [Metadata]: { name: "User" },
};

const schema = {
  User: UserModel,
  [Metadata]: { version: 1 },
} as const satisfies DocumentSchema;

describe("hasSubscriptions", () => {
  let app: PackAppInternal;
  let docRef: DocumentRef<typeof schema>;

  const hasSubscriptions = () =>
    (app.getModule(DOCUMENT_SERVICE_MODULE_KEY) as BaseYjsDocumentService)
      .hasSubscriptionsForTesting(docRef.id);

  const recordRef = () =>
    getStateModule(app).createRecordRef(docRef, "user_1" as RecordId, schema.User);

  beforeEach(async () => {
    app = createTestApp();
    docRef = await getStateModule(app).createDocument({
      documentTypeName: "TestType",
      name: "Test Document",
      ontologyRid: "test-ontology-rid",
      security: {
        discretionary: { editors: [], owners: [], viewers: [] },
        mandatory: { classification: ["MU"], markings: [] },
      },
    }, schema);
  });

  it("returns true for a record with both onChange and onDeleted subscribers", () => {
    const stateModule = getStateModule(app);
    const unsubscribeChanged = stateModule.onRecordChanged(recordRef(), () => {});
    const unsubscribeDeleted = stateModule.onRecordDeleted(recordRef(), () => {});

    expect(hasSubscriptions()).toBe(true);

    unsubscribeChanged();
    unsubscribeDeleted();
  });

  it("returns true for a record with only an onInvalid subscriber", () => {
    const unsubscribeInvalid = getStateModule(app).onRecordInvalid(recordRef(), () => {});

    expect(hasSubscriptions()).toBe(true);

    unsubscribeInvalid();
  });

  it("returns false once every record subscriber has unsubscribed", () => {
    const stateModule = getStateModule(app);
    stateModule.onRecordChanged(recordRef(), () => {})();
    stateModule.onRecordDeleted(recordRef(), () => {})();
    stateModule.onRecordInvalid(recordRef(), () => {})();

    expect(hasSubscriptions()).toBe(false);
  });
});
