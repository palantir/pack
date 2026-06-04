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

import { Button, Callout, Popover, Spinner, Tag } from "@blueprintjs/core";
import { useDocumentTypeMetadata } from "@palantir/pack.state.react";
import React from "react";
import { DOCUMENT_TYPE_NAME } from "../../app.js";
import { usePackApp } from "../../hooks/usePackApp.js";
import css from "./DocumentTypeMetadata.module.css";

function MetadataRow({ label, children }: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <>
      <dt className={css.label}>{label}</dt>
      <dd className={css.value}>{children || <span className={css.muted}>—</span>}</dd>
    </>
  );
}

/**
 * Icon button that opens a popover showing document-type metadata (loadDocumentTypeByName and
 * getDocumentTypeOperationalVersion). Primarily a test surface.
 */
export const DocumentTypeMetadata = React.memo(function DocumentTypeMetadata() {
  const app = usePackApp();
  const { documentType, error, isLoading } = useDocumentTypeMetadata(app, DOCUMENT_TYPE_NAME);

  function renderContent() {
    if (isLoading) {
      return (
        <div className={css.statusRow}>
          <Spinner size={16} />
          <span>Loading metadata…</span>
        </div>
      );
    }

    if (error != null) {
      return (
        <Callout intent="danger" compact title="Failed to load metadata">
          {error.message}
        </Callout>
      );
    }

    return (
      <dl className={css.rows}>
        <MetadataRow label="Name">{documentType?.name ?? DOCUMENT_TYPE_NAME}</MetadataRow>
        <MetadataRow label="RID">
          {documentType?.rid != null && <code className={css.code}>{documentType.rid}</code>}
        </MetadataRow>
        <MetadataRow label="Operational version">
          {documentType?.operationalVersion != null && (
            <Tag minimal intent="primary">{`v${documentType.operationalVersion}`}</Tag>
          )}
        </MetadataRow>
        <MetadataRow label="File system">
          {documentType?.fileSystemType != null && <Tag minimal>{documentType.fileSystemType}</Tag>}
        </MetadataRow>
      </dl>
    );
  }

  return (
    <Popover
      content={
        <div className={css.panel}>
          <h3 className={css.heading}>Document Type</h3>
          {renderContent()}
        </div>
      }
      placement="bottom-start"
    >
      <Button
        aria-label="Document type metadata"
        icon="info-sign"
        title="Document type metadata"
        variant="minimal"
      />
    </Popover>
  );
});
