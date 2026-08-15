# @palantir/pack.schema

TypeScript builders for defining **versioned document schemas** for PACK. You author a schema as a chain of versions; the SDK generator turns it into typed, per-version read and write APIs for your application.

## Records and unions

- {@link defineRecord} — a named set of typed fields.
- {@link defineUnion} — a discriminated choice between record variants.

Field types come from the primitives on the namespace — {@link String}, {@link Double}, {@link Boolean}, {@link Optional}, {@link Array} — or a reference to another record or union. Reference a model by passing it directly, or as `() => Model` for forward and circular references.

## Versions

A schema is a chain of versions:

- {@link defineSchema} — version 1, the initial set of models.
- {@link defineSchemaUpdate} — a named change that evolves records through a builder.
- {@link nextSchema} — compose one or more updates into the next version.

Export the latest version as the module's default export; the generator walks the chain back to the minimum supported version.

## Example

{@include ../../docs/guides/_schema-example.md}
