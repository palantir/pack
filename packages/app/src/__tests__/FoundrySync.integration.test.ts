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

// Runs in node rather than the package default of happy-dom: these tests need a real WebSocket and
// a genuinely absent `document`/`window`, which is also the environment PACK runs in inside a
// SharedWorker.
// @vitest-environment node

import { createClient } from "@osdk/client";
import { initPackApp } from "@palantir/pack.app";
import type {
  DocumentId,
  DocumentRef,
  DocumentSchema,
  RecordId,
  RecordModel,
} from "@palantir/pack.document-schema.model-types";
import { Metadata } from "@palantir/pack.document-schema.model-types";
import { DocumentLiveStatus, DocumentLoadStatus } from "@palantir/pack.state.core";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { FoundryTestEnv } from "./testEnv.js";
import { getFoundryTestEnv } from "./testEnv.js";

const env = getFoundryTestEnv();

/**
 * These tests talk to a real Foundry stack, so they only run when `.env.local` supplies
 * credentials. Without it they skip, keeping a credential-free checkout green.
 */
const describeIntegration = env == null ? describe.skip : describe;

/** Generous: each case does a document create plus at least one full sync round trip. */
const TEST_TIMEOUT_MS = 90_000;

const ThingSchema = z.object({ counter: z.number(), label: z.string() });
type Thing = z.infer<typeof ThingSchema>;

interface ThingModel extends RecordModel<Thing, typeof ThingSchema> {}
const ThingModel: ThingModel = {
  __type: {} as Thing,
  zodSchema: ThingSchema,
  [Metadata]: { name: "Thing" },
};

const TestSchema = {
  Thing: ThingModel,
  [Metadata]: { version: 1 },
} as const satisfies DocumentSchema;

type TestApp = ReturnType<ReturnType<typeof initPackApp>["withState"]>["build"] extends
  () => infer R ? R : never;

/**
 * A PACK client with its own OSDK client, Yjs client id and CometD session — i.e. what a second
 * browser tab or a second process would be, which is what the data-loss reports hinge on.
 */
function createPackClient(testEnv: FoundryTestEnv): TestApp {
  // A static token rather than the OAuth redirect flow: these tests exercise sync, not auth.
  const osdkClient = createClient(
    testEnv.baseUrl,
    testEnv.ontologyRid,
    () => Promise.resolve(testEnv.token),
  );

  return initPackApp(osdkClient, {
    app: { appId: "pack-integration-test" },
    demoMode: false,
    logLevel: "error",
    ontologyRid: testEnv.ontologyRid,
    remote: { baseUrl: testEnv.baseUrl },
  }).withState().build() as TestApp;
}

/** Read a record's current value, or undefined when it has not arrived yet. */
async function readThing(
  app: TestApp,
  docRef: DocumentRef<typeof TestSchema>,
  recordId: string,
): Promise<Thing | undefined> {
  const recordRef = docRef.getRecords(ThingModel).get(recordId as RecordId);
  if (recordRef == null) {
    return undefined;
  }
  return await app.state.getRecordSnapshot(recordRef);
}

/**
 * Write through the state module rather than `docRef.setRecord`, whose data parameter is `never` on
 * the base interface — narrowing it needs a generated SDK's `asVersioned`, and this schema is
 * declared inline.
 */
async function writeThing(
  app: TestApp,
  docRef: DocumentRef<typeof TestSchema>,
  recordId: string,
  data: Thing,
): Promise<void> {
  await app.state.setCollectionRecord(docRef.getRecords(ThingModel), recordId as RecordId, data);
}

/** Poll rather than await a single event, so a test fails with the value it saw. */
async function waitFor<T>(
  read: () => Promise<T | undefined> | T | undefined,
  timeoutMs = 30_000,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) {
      return value;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return undefined;
}

describeIntegration("Foundry sync against a live stack", () => {
  const testEnv = env!;
  const createdDocuments: Array<{ app: TestApp; docRef: DocumentRef }> = [];
  const apps: TestApp[] = [];

  function newApp(): TestApp {
    const app = createPackClient(testEnv);
    apps.push(app);
    return app;
  }

  afterAll(async () => {
    for (const { app, docRef } of createdDocuments) {
      await app.state.deleteDocument(docRef).catch(() => {
        // Best effort: a leaked throwaway document should not fail the run.
      });
    }
  });

  async function createDocument(app: TestApp): Promise<DocumentRef<typeof TestSchema>> {
    const docRef = await app.state.createDocument({
      documentTypeName: testEnv.documentTypeName,
      name: `pack-integration-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      parentFolderRid: testEnv.parentFolderRid,
    }, TestSchema);
    createdDocuments.push({ app, docRef: docRef as DocumentRef });
    return docRef;
  }

  /** Open the same document from an independent client and read a record once data has loaded. */
  async function readFromSecondClient(
    docId: string,
    recordId: string,
  ): Promise<Thing | undefined> {
    const reader = newApp();
    const docRef = reader.state.createDocRef(docId as DocumentId, TestSchema);
    const unsubscribe = reader.state.onStateChange(docRef, () => {});
    try {
      await reader.state.waitForDataLoad(docRef);
      return await waitFor(() => readThing(reader, docRef, recordId));
    } finally {
      unsubscribe();
    }
  }

  it("propagates a write made before any data subscription", async () => {
    const writer = newApp();
    const docRef = await createDocument(writer);

    // The reported repro: written with no subscription open, so before this fix no update handler
    // existed to publish it. It reads back locally either way, which is what made it silent.
    await writeThing(writer, docRef, "thing-1", { counter: 1, label: "before-subscribe" });
    expect(await readThing(writer, docRef, "thing-1"))
      .toMatchObject({ label: "before-subscribe" });

    const unsubscribe = writer.state.onStateChange(docRef, () => {});
    await writer.state.waitForDataLoad(docRef);

    const seen = await readFromSecondClient(docRef.id, "thing-1");
    unsubscribe();

    expect(seen).toMatchObject({ counter: 1, label: "before-subscribe" });
  }, TEST_TIMEOUT_MS);

  it("propagates a write made while the initial load is still in flight", async () => {
    const writer = newApp();
    const docRef = await createDocument(writer);

    // Subscribing starts the load; writing immediately lands in the window before the server's
    // first revision arrives, where updates used to be dropped with only a log line.
    const unsubscribe = writer.state.onStateChange(docRef, () => {});
    await writeThing(writer, docRef, "thing-2", { counter: 2, label: "during-load" });
    await writer.state.waitForDataLoad(docRef);

    const seen = await readFromSecondClient(docRef.id, "thing-2");
    unsubscribe();

    expect(seen).toMatchObject({ counter: 2, label: "during-load" });
  }, TEST_TIMEOUT_MS);

  it("keeps both a pre-subscription and a post-load write visible to a peer", async () => {
    const writer = newApp();
    const docRef = await createDocument(writer);

    // The full reported sequence. The second write was also invisible to peers, because it
    // referenced struct ids from the unpublished first one.
    await writeThing(writer, docRef, "thing-1", { counter: 1, label: "before-subscribe" });
    const unsubscribe = writer.state.onStateChange(docRef, () => {});
    await writer.state.waitForDataLoad(docRef);
    await writeThing(writer, docRef, "thing-2", { counter: 2, label: "after-load" });

    const reader = newApp();
    const readerRef = reader.state.createDocRef(docRef.id, TestSchema);
    const readerUnsubscribe = reader.state.onStateChange(readerRef, () => {});
    await reader.state.waitForDataLoad(readerRef);

    const both = await waitFor(async () => {
      const first = await readThing(reader, readerRef, "thing-1");
      const second = await readThing(reader, readerRef, "thing-2");
      return first != null && second != null ? { first, second } : undefined;
    });

    readerUnsubscribe();
    unsubscribe();

    expect(both?.first).toMatchObject({ label: "before-subscribe" });
    expect(both?.second).toMatchObject({ label: "after-load" });
  }, TEST_TIMEOUT_MS);

  it("reports the data channel as connected once sync is established", async () => {
    const app = newApp();
    const docRef = await createDocument(app);

    const unsubscribe = app.state.onStateChange(docRef, () => {});
    await app.state.waitForDataLoad(docRef);

    const status = app.state.getDocumentStatus(docRef);
    unsubscribe();

    // Read `disconnected` here permanently before the liveness fix, while data synced fine.
    expect(status.data.load).toBe(DocumentLoadStatus.LOADED);
    expect(status.data.live).toBe(DocumentLiveStatus.CONNECTED);
    expect(status.metadata.live).toBe(DocumentLiveStatus.CONNECTED);
  }, TEST_TIMEOUT_MS);

  it("rejects waitForMetadataLoad when nothing will start a load", async () => {
    const app = newApp();
    const docRef = await createDocument(app);
    const detachedRef = app.state.createDocRef(docRef.id, TestSchema);

    // Hung forever before the guard. Uses a real ref so the failure is the guard, not a bad id.
    const unsubscribe = app.state.onStateChange(detachedRef, () => {});
    unsubscribe();

    await expect(app.state.waitForMetadataLoad(detachedRef)).rejects.toThrow(
      /no metadata subscription is registered|Metadata load/,
    );
  }, TEST_TIMEOUT_MS);

  it("delivers a live update from one client to another", async () => {
    const writer = newApp();
    const docRef = await createDocument(writer);
    const writerUnsubscribe = writer.state.onStateChange(docRef, () => {});
    await writer.state.waitForDataLoad(docRef);

    const reader = newApp();
    const readerRef = reader.state.createDocRef(docRef.id, TestSchema);
    const readerUnsubscribe = reader.state.onStateChange(readerRef, () => {});
    await reader.state.waitForDataLoad(readerRef);

    await writeThing(writer, docRef, "live-1", { counter: 42, label: "live" });

    const seen = await waitFor(() => readThing(reader, readerRef, "live-1"));

    readerUnsubscribe();
    writerUnsubscribe();

    expect(seen).toMatchObject({ counter: 42, label: "live" });
  }, TEST_TIMEOUT_MS);
});
