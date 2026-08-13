---
sidebar_position: 3
---

# Quickstart

The quickest way to get started is using the project generator in `@palantir/pack.create-app`.

### 1. Create a Developer Console Application

To connect your application to Foundry, you'll need to create a Developer Console Application.
Full documentation for this can be found [here](https://www.palantir.com/docs/foundry/developer-console/create-application/).

- Ensure you create a **Client-facing Application**.
- Add a redirect URL for `http://localhost:5173/auth/callback`
  - This is the default address used by `@palantir/pack.create-app`
- Note the **Client ID** on the **Overview** page of your dev-console app, we'll need this in the next step.

After creating the application, you'll need to enable the **PACK API**s in the **Platform SDK**. 

### 2. Scaffold a workspace

Create a new PACK workspace starter (a `schema` + `sdk` + `app` npm workspace) using the wizard from the `create-app` CLI. 

You'll need:
- the URL of your Foundry stack, e.g. `https://my-customer-name.palantircloud.com/`,
- the **Client ID** copied from the previous step,
- the **Ontology RID** of the Ontology you'll use along side this application
    - this can be found in the **Ontology configuration** section of Ontology Manager

```bash
npx @palantir/pack.create-app -t workspace
```

This will create a new folder with the name of your project, `cd` into this folder:

```bash
cd my-pack-app
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
