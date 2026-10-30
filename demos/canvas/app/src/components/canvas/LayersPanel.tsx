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

import type { OptionProps } from "@blueprintjs/core";
import { Button, HTMLSelect, Icon } from "@blueprintjs/core";
import type { NodeShapeModel, VersionedDocRef } from "@demo/canvas.sdk";
import { narrowKnownNodeShape } from "@demo/canvas.sdk";
import type { RecordId, RecordRef } from "@palantir/pack.document-schema.model-types";
import { useRecord } from "@palantir/pack.state.react";
import { memo, useMemo } from "react";
import type { LayerActions, LayerNode, LayerTree } from "../../hooks/useLayerTree.js";
import { LAYER_ROOT_ID, listFolders, useLayerActions } from "../../hooks/useLayerTree.js";
import styles from "./LayersPanel.module.css";

const INDENT_PX = 16;

export interface LayersPanelProps {
  readonly doc: VersionedDocRef;
  readonly tree: LayerTree;
}

export const LayersPanel = memo(function LayersPanel({ doc, tree }: LayersPanelProps) {
  const actions = useLayerActions(doc, tree);
  const folderOptions = useMemo(
    (): OptionProps<string>[] => [
      { label: "Top level", value: LAYER_ROOT_ID },
      ...listFolders(tree.roots).map(({ depth, folder }) => ({
        // Non-breaking, since browsers collapse leading spaces in options.
        label: `${"\u00a0\u00a0".repeat(depth)}${folder.name}`,
        value: folder.id,
      })),
    ],
    [tree.roots],
  );

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Layers</h2>
        <Button
          icon="folder-new"
          onClick={() => actions.addFolder(LAYER_ROOT_ID)}
          size="small"
          title="New folder"
          variant="minimal"
        />
      </div>
      {tree.roots.length === 0
        ? <p className={styles.empty}>Nothing on the canvas yet</p>
        : (
          <LayerList
            actions={actions}
            depth={0}
            folderOptions={folderOptions}
            isParentVisible={true}
            nodes={tree.roots}
            parentId={LAYER_ROOT_ID}
          />
        )}
    </aside>
  );
});

interface LayerListProps {
  readonly actions: LayerActions;
  readonly depth: number;
  readonly folderOptions: readonly OptionProps<string>[];
  readonly isParentVisible: boolean;
  /** In drawing order, bottom first. */
  readonly nodes: readonly LayerNode[];
  readonly parentId: RecordId;
}

function LayerList({ nodes, ...rowProps }: LayerListProps) {
  // The top layer is listed first, so the panel reads in reverse drawing order.
  const rows = [...nodes].reverse();
  return (
    <ul className={styles.list}>
      {rows.map((node, index) => (
        <LayerRow
          {...rowProps}
          canMoveBackward={index < rows.length - 1}
          canMoveForward={index > 0}
          key={node.id}
          node={node}
        />
      ))}
    </ul>
  );
}

interface LayerRowProps extends Omit<LayerListProps, "nodes"> {
  readonly canMoveBackward: boolean;
  readonly canMoveForward: boolean;
  readonly node: LayerNode;
}

function LayerRow({
  actions,
  canMoveBackward,
  canMoveForward,
  depth,
  folderOptions,
  isParentVisible,
  node,
  parentId,
}: LayerRowProps) {
  const isShown = isParentVisible && node.visible;

  return (
    <li>
      <div
        className={isShown ? styles.row : `${styles.row} ${styles.hidden}`}
        style={{ paddingLeft: 8 + depth * INDENT_PX }}
      >
        <Button
          icon={node.visible ? "eye-open" : "eye-off"}
          onClick={() => actions.setVisible(node, !node.visible)}
          size="small"
          title={node.visible ? "Hide" : "Show"}
          variant="minimal"
        />
        <LayerLabel node={node} />
        {node.kind !== "folder" && (
          <HTMLSelect
            className={styles.select}
            minimal={true}
            onChange={e => actions.moveToFolder(node.id, e.target.value as RecordId)}
            options={folderOptions}
            title="Move to folder"
            value={parentId}
          />
        )}
        <Button
          disabled={!canMoveForward}
          icon="chevron-up"
          onClick={() => actions.moveLayer(node.id, "forward")}
          size="small"
          title="Bring forward"
          variant="minimal"
        />
        <Button
          disabled={!canMoveBackward}
          icon="chevron-down"
          onClick={() => actions.moveLayer(node.id, "backward")}
          size="small"
          title="Send backward"
          variant="minimal"
        />
        {node.kind === "folder" && (
          <>
            <Button
              icon="folder-new"
              onClick={() => actions.addFolder(node.id)}
              size="small"
              title="New folder inside"
              variant="minimal"
            />
            <Button
              icon="trash"
              onClick={() => actions.deleteFolder(node.id)}
              size="small"
              title="Delete folder (keeps its contents)"
              variant="minimal"
            />
          </>
        )}
      </div>
      {node.kind === "folder" && node.children.length > 0 && (
        <LayerList
          actions={actions}
          depth={depth + 1}
          folderOptions={folderOptions}
          isParentVisible={isShown}
          nodes={node.children}
          parentId={node.id}
        />
      )}
    </li>
  );
}

function LayerLabel({ node }: { readonly node: LayerNode }) {
  switch (node.kind) {
    case "folder":
      return (
        <>
          <Icon className={styles.icon} icon="folder-close" />
          <span className={styles.name}>{node.name}</span>
        </>
      );
    case "shape":
      return <ShapeLabel shapeRef={node.ref} />;
    case "stroke":
      return (
        <>
          <Icon className={styles.icon} icon="draw" />
          <span className={styles.name}>Stroke</span>
        </>
      );
  }
}

function ShapeLabel({ shapeRef }: { readonly shapeRef: RecordRef<typeof NodeShapeModel> }) {
  const shapeType = narrowKnownNodeShape(useRecord(shapeRef).data)?.shapeType;
  return (
    <>
      <Icon className={styles.icon} icon={shapeType === "circle" ? "circle" : "square"} />
      <span className={styles.name}>
        {shapeType === "circle" ? "Circle" : shapeType === "box" ? "Box" : "Shape"}
      </span>
    </>
  );
}
