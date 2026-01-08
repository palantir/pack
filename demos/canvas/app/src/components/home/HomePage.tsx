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

import { Button } from "@blueprintjs/core";
import React, { useCallback } from "react";
import { useCanvasDocuments } from "../../hooks/useCanvasDocuments.js";
import { CreateFileDialog } from "./CreateCanvasDialog.js";
import { DocumentList } from "./DocumentList.js";
import css from "./HomePage.module.css";

export const HomePage = React.memo(function HomePage() {
  const { documents, isLoading, error } = useCanvasDocuments();
  const [createDialogIsOpen, setCreateDialogIsOpen] = React.useState(false);

  const showCreateDialog = useCallback(() => {
    setCreateDialogIsOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className={css.pageWrapper}>
        <div className={css.loading}>Loading canvases...</div>
      </div>
    );
  }

  return (
    <div className={css.pageWrapper}>
      <div className={css.pageHeader}>
        <h1>Canvas Demo</h1>
        <Button onClick={showCreateDialog}>
          Create New Canvas
        </Button>
      </div>
      <div>
        <div>
          <h2>Canvases ({documents.length} items)</h2>
          <div>
            <DocumentList documents={documents} error={error} />
          </div>
          <CreateFileDialog isOpen={createDialogIsOpen} setIsOpen={setCreateDialogIsOpen} />
        </div>
      </div>
    </div>
  );
});
