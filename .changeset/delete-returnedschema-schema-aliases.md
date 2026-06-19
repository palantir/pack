---
"@palantir/pack.schema": minor
---

Remove the deprecated `ReturnedSchema` and `Schema` type aliases from `@palantir/pack.schema`. Both were thin aliases over `ModelDefs` (`ReturnedSchema = ModelDefs`, `Schema<T> = T`) and were marked for removal. Use `ModelDefs` directly instead.
