---
"@palantir/pack.codegen.core": patch
---

Template hooks given as file paths now receive the generator context on stdin instead of as a command-line argument. The context includes the schema, so large schemas could hit the per-argument length limit (128 KiB on Linux), and some environments kill processes started with very long arguments. In both cases the hook failed with `Hook afterGenerate failed with exit code null`.
