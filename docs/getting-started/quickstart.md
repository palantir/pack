---
sidebar_position: 3
---

# Quickstart

_Content coming soon._

## Package Setup

A typical PACK app contains three packages:

1. A schema package. 
    1. This uses the schema builder functions from "@palantir/pack.schema" to define a versioned schema for an application.
    2. Contains scripts for generating the SDK from this schema, using "@palantir/pack.sdkgen" and the versioned SDK template "@palantir/pack.sdkgen.pack-versioned-template".
2. An SDK package.
    1. This is generated from the above schema definition, and provides a versioned set of types and utilities for interacting with your defined documents, activity and presence events.
3. An Application package.
    1. This is your application, which takes a dependency on the SDK and on the core PACK libraries. This is often an OSDK application, reading and writing data from the Foundry Ontology in addition to using PACK for application state.
