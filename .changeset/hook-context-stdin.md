---
"@palantir/pack.codegen.core": patch
---

Pass the hook context to the child process over stdin instead of as a command-line argument, so a large context (such as a full schema) no longer hits the argv size limit or gets killed on Node 26. Hook failures caused by a signal now report the signal instead of "exit code null".
