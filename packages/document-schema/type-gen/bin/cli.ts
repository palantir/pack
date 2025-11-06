#!/usr/bin/env -S npx bun@1.3.0

// We run the CLI using tsx so certain commands can import ts files and take
// advantage of the ts loader. We use the built version for packaging reasons.
import { cli } from "../build/esm/index.js";
cli(process.argv);
