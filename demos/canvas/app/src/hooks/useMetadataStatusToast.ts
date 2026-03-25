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

import type { Toaster } from "@blueprintjs/core";
import type { DocumentRef } from "@palantir/pack.document-schema.model-types";
import { useEffect } from "react";
import { app } from "../app.js";

export function useMetadataStatusToast(
  docRef: DocumentRef,
  toaster: Toaster | null,
): void {
  useEffect(() => {
    if (toaster == null) {
      return;
    }

    const unsubscribe = app.state.onStatusChange(docRef, (_docRef, status) => {
      if (status.metadata.load === "error") {
        toaster.show({
          icon: "warning-sign",
          intent: "danger",
          message:
            "Error loading document metadata. You may have lost access, or try refreshing the page.",
          timeout: 0,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [docRef, toaster]);
}
