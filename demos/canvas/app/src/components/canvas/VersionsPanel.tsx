/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
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

import { Button, Callout, Classes, Popover, Spinner } from "@blueprintjs/core";
import type { DocumentRef, PublishedVersionRef } from "@palantir/pack.document-schema.model-types";
import { usePublishedVersions } from "@palantir/pack.state.react";
import { memo, useState } from "react";
import { app } from "../../app.js";
import { formatTimeAgo } from "../../utils/formatTimeAgo.js";
import styles from "./VersionsPanel.module.css";

export interface VersionsPanelProps {
  readonly docRef: DocumentRef;
  readonly openVersionRef?: PublishedVersionRef;
  onOpenVersion: (versionRef: PublishedVersionRef | undefined) => void;
}

export const VersionsPanel = memo(function VersionsPanel(props: VersionsPanelProps) {
  return (
    <Popover content={<VersionsList {...props} />} placement="bottom-end">
      <Button text="Versions" title="Published versions" />
    </Popover>
  );
});

function VersionsList({ docRef, onOpenVersion, openVersionRef }: VersionsPanelProps) {
  const { error, isLoading, refresh, versions } = usePublishedVersions(app, docRef);
  const [deleteError, setDeleteError] = useState<string>();
  const [deletingVersionRef, setDeletingVersionRef] = useState<PublishedVersionRef>();

  const deleteVersion = async (versionRef: PublishedVersionRef) => {
    setDeleteError(undefined);
    setDeletingVersionRef(versionRef);

    try {
      await app.state.deletePublishedVersion(docRef, versionRef);
      refresh();
      if (versionRef === openVersionRef) {
        onOpenVersion(undefined);
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete version");
    } finally {
      setDeletingVersionRef(undefined);
    }
  };

  const openButtonClassName = `${styles.openButton} ${Classes.POPOVER_DISMISS}`;

  return (
    <aside className={styles.panel}>
      <h2 className={styles.header}>Versions</h2>
      <ul className={styles.list}>
        <li className={getItemClassName(openVersionRef == null)}>
          <button
            className={openButtonClassName}
            onClick={() => onOpenVersion(undefined)}
            type="button"
          >
            <span className={styles.name}>Live draft</span>
            <span className={styles.details}>Live and editable</span>
          </button>
        </li>
        {versions?.map(version => (
          <li className={getItemClassName(version.ref === openVersionRef)} key={version.ref}>
            <button
              className={openButtonClassName}
              onClick={() =>
                onOpenVersion(version.ref)}
              type="button"
            >
              <span className={styles.name}>{version.name ?? "Untitled version"}</span>
              {version.description != null && (
                <span className={styles.details}>{version.description}</span>
              )}
              <time className={styles.time} dateTime={version.createdAt}>
                Published {formatTimeAgo(Date.parse(version.createdAt))}
              </time>
            </button>
            <Button
              icon="trash"
              loading={deletingVersionRef === version.ref}
              onClick={() =>
                void deleteVersion(version.ref)}
              size="small"
              title="Delete version"
              variant="minimal"
            />
          </li>
        ))}
      </ul>
      {isLoading && (
        <div className={styles.status}>
          <Spinner size={16} />
          Loading versions…
        </div>
      )}
      {!isLoading && versions?.length === 0 && (
        <p className={styles.empty}>No published versions yet</p>
      )}
      {(error?.message ?? deleteError) != null && (
        <Callout className={styles.callout} compact={true} intent="danger">
          {error?.message ?? deleteError}
        </Callout>
      )}
    </aside>
  );
}

function getItemClassName(isOpen: boolean): string | undefined {
  return isOpen ? `${styles.item} ${styles.selected}` : styles.item;
}
