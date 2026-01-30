# PACK Documentation

This guide covers the concepts and patterns you need to understand PACK as a whole. For package-specific APIs, see each package's README.

## Table of Contents

- [What is PACK?](#what-is-pack)
- [The Document Primitive](#the-document-primitive)
- [What Goes Where: Ontology vs. Document](#what-goes-where-ontology-vs-document)
- [Architecture Overview](#architecture-overview)
- [Which Packages Do I Need?](#which-packages-do-i-need)
- [Schema & SDK Generation](#schema--sdk-generation)
- [Building Your App: The Typical Workflow](#building-your-app-the-typical-workflow)
- [Troubleshooting](#troubleshooting)

---

## What is PACK?

PACK (Platform Application Capabilities Kit) is a framework that sits alongside OSDK and facilitates building rich, collaborative applications within the Foundry developer platform.

PACK is the evolution of battle-tested real-time frameworks used internally at Palantir to build collaborative applications. It's designed for multiplayer apps where everyone needs the same view of data in real time.

---

## The Document Primitive

The **document** is the core concept in PACK. Think of it as a collaborative workspace—a single, shareable unit where multiple users can work together with a consistent view of the same data.

Your ontology holds the real data (objects, relationships, properties). A document sits on top of that, adding:

- **Presentation state**: How that data is arranged, filtered, or displayed in your app
- **Collaboration features**: Who's looking at it, what changed, where their cursor is

All of this is defined in a single **document schema**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Document Schema                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│   │       State       │  │     Activity      │  │     Presence      │       │
│   │                   │  │                   │  │                   │       │
│   │  What the doc     │  │  What changed     │  │  Who's here now   │       │
│   │  contains         │  │  over time        │  │  and what they're │       │
│   │                   │  │                   │  │  doing            │       │
│   │                   │  │                   │  │                   │       │
│   │  [PERSISTED]      │  │  [PERSISTED]      │  │  [EPHEMERAL]      │       │
│   └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### State

The document's content—positions of elements, view settings, references to ontology objects. This is what gets saved and synced across users.

Documents use **CRDTs** (Conflict-free Replicated Data Types) under the hood, which means when two users edit simultaneously, conflicts resolve automatically. No manual merge required.

### Activity

The document's changelog. When a user opens a document, they often want to know: _what happened while I was away?_ Activity answers that by tracking events over time.

You define what events matter for your app (e.g., "shape added", "filter changed"). Since your document already references ontology objects, activity can also pull in edits to those objects—giving users a unified history of everything relevant to this document.

### Presence

Real-time, ephemeral state that exists only in the moment. Cursor positions, who's currently viewing, what's selected. This data changes constantly and has no value after the fact, so it's broadcast over WebSocket rather than persisted.

The key distinction:

|              | Persisted                        | Ephemeral                    |
| ------------ | -------------------------------- | ---------------------------- |
| **What**     | Document state, activity history | Cursors, viewers, selections |
| **Where**    | Foundry backend                  | WebSocket channel            |
| **Lifetime** | Permanent                        | Gone when you disconnect     |

---

## What Goes Where: Ontology vs. Document

When building a PACK app, you'll constantly be asking: should this data live in the ontology or in the document?

**The ontology is your source of truth.** It's where real, meaningful data belongs—the stuff that has value beyond any single document. Objects, properties, relationships. Other apps can query it. Foundry governs it. It persists independently.

**Documents hold the view.** They describe how a particular user (or group of users) is looking at ontology data. Positions, layouts, filters, UI toggles. This state is meaningful only in the context of this document.

A simple test: _Would this data be useful to another app?_ If yes, it belongs in the ontology. If it only makes sense inside your app's UI, it belongs in the document.

**Example**: A tactical map shows units and their positions. The unit data (name, type, status) lives in the ontology—other apps need it too. But the map document stores where each unit icon is placed on _this particular map_, whether labels are visible, and what zoom level the user prefers. That's presentation state, not real data.

---

## Architecture Overview

PACK separates _what your app does_ from _where the data lives_. Your application code talks to PACK's APIs. Behind those APIs, you choose the implementation: mock everything locally, or connect to real Foundry services.

```
┌─────────────────────────────────────────────────────┐
│                   Your Application                   │
├─────────────────────────────────────────────────────┤
│   @palantir/pack.app                                │
│   Initializes PACK and wires everything together    │
├──────────────────────┬──────────────────────────────┤
│   Auth               │   State                      │
│   ┌────────────────┐ │   ┌────────────────────────┐ │
│   │ pack.auth      │ │   │ pack.state.core        │ │
│   │ (the API)      │ │   │ (the API)              │ │
│   └───────┬────────┘ │   └───────────┬────────────┘ │
│           │          │               │              │
│           │                     choose one:         │
│           │          │               │              │
│   ┌───────▼────────┐ │   ┌───────────▼────────────┐ │
│   │ pack.auth.     │ │   │ pack.state.foundry     │ │
│   │ foundry        │ │   │   (real Foundry)       │ │
│   │ (real OAuth)   │ │   │                        │ │
│   │                │ │   │ pack.state.demo        │ │
│   │                │ │   │   (in-memory mock)     │ │
│   └────────────────┘ │   └────────────────────────┘ │
├──────────────────────┴──────────────────────────────┤
│   @palantir/pack.core                               │
│   Shared types and utilities                        │
└─────────────────────────────────────────────────────┘
```

This means you can build and test your app without Foundry access—use the demo implementations. When you're ready to deploy, swap in the Foundry implementations. Your app code stays the same.

### Key Terms

| Term              | What It Is                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Document**      | The core primitive. Bundles app state + ontology references. Backed by CRDTs.              |
| **Activity**      | Persisted history of user actions and ontology edits on a document.                        |
| **Presence**      | Ephemeral, real-time state (cursors, viewers) broadcast over WebSocket.                    |
| **Schema**        | Defines document structure, activity events, and presence events. Generates type-safe SDK. |
| **State Service** | Manages document lifecycle: create, read, update, subscribe to changes.                    |
| **Auth Service**  | Handles authentication and provides tokens for API calls.                                  |
| **OSDK Client**   | The Foundry SDK client that PACK uses under the hood.                                      |

---

## Schema & SDK Generation

Your document schema defines three things in one YAML file:

- **Document state**: The shape of your app-specific data
- **Activity events**: Actions to track in history
- **Presence events**: Ephemeral broadcasts (cursors, selections)

Regenerate the SDK whenever you modify the schema. Commit the generated code to your repo.

---

## Building Your App: The Typical Workflow

Here's the typical sequence when building a PACK application:

### 1. Define Your Document Type

Create your schema YAML defining document state, activity events, and presence events. See the [Canvas demo schema](../demos/canvas/sdk/schema/) for a real example.

### 2. Generate Your SDK

Run `sdkgen` to produce type-safe TypeScript from your schema. See the [sdkgen README](../packages/sdkgen/sdkgen-cli/README.md) for usage. Commit the generated SDK to your repo.

### 3. Deploy Schema to Foundry

<!-- TODO: Make more clear in type-gen README -->

Generate IR from your YAML schema, then upload to Foundry using [pack.document-schema.type-gen](../packages/document-schema/type-gen/README.md):

```
# Generate IR from YAML schema
pack-type-gen steps ir \
  --input <schema.yaml> \
  --output <schema-ir.json>

# Deploy IR to Foundry
pack-type-gen ir deploy \
  --ir <schema-ir.json> \
  --base-url <foundry-url> \
  --auth <token> \
  --parent-folder <folder-rid>
```

This creates the document type in Foundry so your app can create and open documents of this type.

### 4. Wire Up Your App

Initialize PACK: auth → OSDK client → PACK app. See [pack.app README](../packages/app/README.md) for setup examples.

For React apps, wrap your app with `<PackProvider>` and use hooks like `useDocument`. See [pack.state.react](../packages/state/react/README.md).

For environment variables and OAuth setup, see the [Canvas demo](../demos/canvas/README.md).

---

## Troubleshooting

### Authentication Issues

**OAuth redirect loop**

- Ensure `VITE_REDIRECT_URL` exactly matches what's registered in Foundry
- Check that your OAuth client has the correct scopes
- Clear cookies/storage and try again

### State & Documents

**Documents not persisting**

- Check that the OSDK client is properly authenticated

**Type errors with documents**

- Regenerate your SDK if you've updated the schema
- Ensure generated SDK version matches your PACK package versions

### Build & Development

**"Cannot find module" errors**

- Run `pnpm install` from the monorepo root
- Check that the package is listed in your app's dependencies

**Turbo cache issues**

- Run `pnpm turbo --force` to bypass cache
- Or delete `.turbo` directories

**Type errors across packages**

- Run `pnpm turbo typecheck` to see all errors
- Ensure all PACK packages are on compatible versions
