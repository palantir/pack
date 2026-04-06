/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Command } from "commander";
import { assetDeployHandler } from "./assetDeployHandler.js";

export function registerAssetCommands(program: Command): void {
  const assetCmd = program
    .command("asset")
    .description("Asset-based document type commands");

  assetCmd
    .command("deploy")
    .description("Deploy a document type to a Foundry stack using an asset JSON file")
    .requiredOption("-i, --input <file>", "Path to asset JSON file (output of 'ir asset')")
    .requiredOption("-b, --base-url <url>", "Base URL for Foundry API")
    .requiredOption("-a, --auth <token>", "Authentication token for Foundry API")
    .requiredOption("-o, --ontology-rid <rid>", "Target ontology RID")
    .action(assetDeployHandler);
}
