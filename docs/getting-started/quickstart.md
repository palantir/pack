---
sidebar_position: 3
---

# Quickstart

## Scaffold a workspace

Create a new PACK workspace starter (a `schema` + `sdk` + `app` npm workspace) with
the `create-app` CLI:

```bash
npx @palantir/pack.create-app my-pack-app --template workspace
cd my-pack-app
```

### 1. Create a Developer Console Application

{/* TODO: describe creating a Developer Console application and where to find the
client id, API URL, and ontology RID used in the next step. */}

### 2. Configure the app

Copy the example env file and fill in the values from your Developer Console
application:

```bash
cp packages/app/.env.example packages/app/.env.local
# then edit packages/app/.env.local (client id, API URL, ontology RID)
```

### 3. Generate the SDK and run the app

```bash
npm run sdk-gen    # generate the SDK from packages/schema
npm run build:sdk  # compile the generated SDK
npm run dev        # start the example app
```

Re-run `sdk-gen` then `build:sdk` whenever you change `packages/schema/src/schema.mjs`.

## Package Setup

A typical PACK app contains three packages:

1. A schema package. 
    1. This uses the schema builder functions from "@palantir/pack.schema" to define a versioned schema for an application.
    2. Contains scripts for generating the SDK from this schema, using "@palantir/pack.sdkgen" and the versioned SDK template "@palantir/pack.sdkgen.pack-versioned-template".
2. An SDK package.
    1. This is generated from the above schema definition, and provides a versioned set of types and utilities for interacting with your defined documents, activity and presence events.
3. An Application package.
    1. This is your application, which takes a dependency on the SDK and on the core PACK libraries. This is often an OSDK application, reading and writing data from the Foundry Ontology in addition to using PACK for application state.
