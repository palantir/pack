---
"@palantir/pack.document-schema.type-gen": minor
---

type-gen now throws a clear error when two things in the generated SDK would have the same name, for example a record `KnownFoo` next to a union `Foo`, or a model named like a name the SDK already uses, such as `Metadata` or `DocumentModel`. It also throws when a generated type would have two properties with the same name, such as a union variant record with a field named like the discriminant, and when a model name contains `_v` followed by a number, which could clash in a later schema version. The check runs in `schema ir`, in every command that reads an IR chain, and before an SDK is generated. Before, these schemas produced an SDK that failed to compile or, in some cases, exported the wrong type.
