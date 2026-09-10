---
"@palantir/pack.state.react": patch
---

Return an empty array from useRecords when the document reference is invalid, so it can be used with useDocRef before a document ID is available.
