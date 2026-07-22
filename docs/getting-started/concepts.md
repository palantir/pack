---
sidebar_position: 1
---

# Concepts

## Documents

Applications in the Foundry developer platform are typically backed by the Ontology, for displaying and modifying the core Ontological data asset of the enterprise. However, many applications also need some notion of saved states, project files or local storage.

A **Document** is designed to provide a sharable unit of application state, where users can collaborative together on building a work product or shared view of the Ontology data. Documents provide for presentational state of how data is presented, arranged, filtered or displayed.

A **Document Type** contains the schema and metadata the documents. This is used to generate an SDK for building multiplayer, collaborative applications that read and write documents.

Documents are built on top of **CRDTs** (Conflict-free Replicated Data Types). This means that multiple users when conflicts across users resolve automatically.

## Activity

Resources and Objects in the Foundry developer platform can change over time, leaving users with the question of "What happened while I was away?". **Activity Events** answer this by tracking changes to resources over time. 

Activity Events are defined by their schema, which is used to generate an SDK for creating and listing events for some target. Currently, Documents are the only supported target, and can be used to describe each edit to a document.

## Presence

The Foundry developer platform is a collaborative environment, with many users active and making changes. **Presence Events** are real-time events that can be used to power interactive experiences, such as shared cursors or cross-user selection. These events indicate state that is constantly changing and ephemeral, and so are not stored.

Presence Events are defined by the schema, which is used to generate and SDK for creating and receiving events for some target. Currently, Documents are the only supported target.