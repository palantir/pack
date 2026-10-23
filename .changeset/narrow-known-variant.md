---
"@palantir/pack.document-schema.type-gen": minor
---

Every generated union now has a `Known<Union>` type (its variants without the Unknown case) and a `narrowKnown<Union>()` function that returns `undefined` for an unknown value. Use them to narrow before reading variant fields, instead of writing the check by hand.
