---
"@palantir/pack.document-schema.model-types": minor
"@palantir/pack.state.core": minor
"@palantir/pack.state.react": minor
---

Record snapshots are now validated against their model's zod schema at read time, so corrupted document state can be observed and handled gracefully instead of crashing consumers. Invalid records are withheld from `onChange` delivery and surfaced through the new `RecordRef.onInvalid` / `onRecordInvalid` subscriptions, a new `"invalid"` status (with a `RecordValidationError`) on `useRecord`, `getInvalidRecords` on the state module/document service (returning the known invalid records observed so far, re-validated and pruned on each call), and an `invalidRecordCount` on the data channel of `DocumentStatus`. `RecordRef.getSnapshot` now rejects with `RecordInvalidError` when the record exists but fails validation. Records repaired by a later update automatically resume `onChange` delivery. Exceptions thrown during snapshot computation (e.g. an upgrade lens applied to corrupt data) are contained and reported as invalid records rather than escaping into notification fan-out; `updateRecord` rejects with `RecordInvalidError` for unreadable records, while `deleteRecord` remains usable on them so delete-and-recreate repair works.
