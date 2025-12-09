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

import React from "react";
import { useNavigate } from "react-router";
import { useCanvasDocuments } from "../../hooks/useCanvasDocuments.js";
import css from "./HomePage.module.css";

export const HomePage = React.memo(function HomePage() {
  const navigate = useNavigate();
  const { documents, isLoading } = useCanvasDocuments();

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
        <h1>Projects</h1>
      </div>
      <div>
        <div>
          <h2>Canvases ({documents.length} items)</h2>
          <div>
            {documents.length === 0
              ? (
                <div className={css.emptyList}>
                  <p>No canvases found in the ontology</p>
                </div>
              )
              : (
                <div className={css.listItems}>
                  {/* TODO: Render list of documents */}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
});
