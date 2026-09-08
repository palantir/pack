# @palantir/pack.state.react

React hooks and components for integrating PACK's real-time state management into React applications.

## Overview

This package provides React-specific bindings for PACK's state management system, offering hooks that seamlessly integrate with React's component lifecycle and provide reactive updates to PACK document state.

## Key Exports

### Hooks

- `useDocRef(app, documentModel, documentId)` - Hook for managing document references
- `useDocMetadata(docRef)` - Hook for accessing document metadata and status
- `useRecord(recordRef)` - Hook for accessing individual records
- `useRecords(collectionRef)` - Hook for accessing and managing record collections

## Usage

Create a typed provider and hook next to the configured app. This preserves accessors added by
`.withState()` for example, instead of narrowing the app back to the base `PackApp` type.

```typescript
import { initPackApp } from "@palantir/pack.app";
import { createPackAppContext } from "@palantir/pack.state.react";

export const app = initPackApp(client, options).withState().build();
export const { PackAppProvider, usePackApp } = createPackAppContext(app);
```

If the app is created asynchronously, create the typed context first and pass the finished app to
the provider:

```tsx
async function initializePackApp() {
  // await any required setup
  return initPackApp(client, options).withState().build();
}

type App = Awaited<ReturnType<typeof initializePackApp>>;

export const { PackAppProvider, usePackApp } = createPackAppContext<App>();

const app = await initializePackApp();

<PackAppProvider value={app}>
  <App />
</PackAppProvider>;
```

```typescript
import { createRecordCollectionRef, createRecordRef } from "@palantir/pack.state.core";
import {
  useDocMetadata,
  useDocRef,
  useRecord,
  useRecords,
} from "@palantir/pack.state.react";
import { DocumentModel, NoteModel } from "@myapp/generated-sdk";
import * as React, {useEffect, useMemo, useCallback} from "react";
import { app } from "./packClient";

type NoteRef = RecordRef<NoteModel>;

export function MyComponent() {
  // Get document reference
  const docRef = useDocRef(app, DocumentModel, "my-document-id");
  const notes = useRecords(docRef, NoteModel);

  const { isMetadataLoading, metadata } = useDocMetadata(docRef);
  // TODO: separate useDocumentStatus to understand data load / live status changes

  const handleAddNote = useCallback(() => {
    docRef.getRecords(NoteModel).add({ text: "New note" });
  });

  if (!isMetadataLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>{metadata.name}</h1>
      <h2>{`${notes.size} notes`}</h2>
      <button onClick={handleAddNote}>Add note</button>
      {notes.map((noteRef) => (<NoteComponent key={noteRef.id} noteRef={noteRef}/>)}
    </div>
  );
}

const NoteComponent = React.memo<{ noteRef: NoteRef }>(({ noteRef }) => {
  const record = useRecord(noteRef);

  const handleUpdate = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    noteRef.update({ text: e.target.value });
  }, [noteRef]);

  if (record.status === "loading") {
    return <div>Loading...</div>;
  }

  if (record.status === "deleted") {
    return null;
  }

  return (
    <div>
      <textarea onChange={handleUpdate}>
        {record.data.text}
      </textarea>
    </div>
  );
});
```

## Features

- **Reactive Updates** - Hooks automatically re-render components when underlying state changes
- **Type Safety** - Full TypeScript support with proper type inference
- **Loading States** - Built-in handling of document loading and connection states
- **Real-time Sync** - Automatic updates when documents change from other clients
- **React Integration** - Follows React patterns and lifecycle management

## Dependencies

This package requires:

- `@palantir/pack.state.core` for core state management functionality
- React 18+ for hook support
