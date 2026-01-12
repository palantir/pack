---
"@palantir/pack.state.react": major
---

Change useRecord loading state to use status field. Consumers should use status field to determine whether a record is loading, loaded or deleted. Removed isLoading to better discriminate records that have been deleted and have no data.
