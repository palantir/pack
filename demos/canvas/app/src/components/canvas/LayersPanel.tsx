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

import type { IconName, OptionProps } from "@blueprintjs/core";
import { Button, HTMLSelect, Icon, InputGroup } from "@blueprintjs/core";
import type { NodeShapeModel, VersionedDocRef } from "@demo/canvas.sdk";
import { narrowKnownNodeShape } from "@demo/canvas.sdk";
import type { RecordId, RecordRef } from "@palantir/pack.document-schema.model-types";
import { useRecord } from "@palantir/pack.state.react";
import type { DragEvent } from "react";
import { memo, useMemo, useRef, useState } from "react";
import type {
  LayerActions,
  LayerDropPosition,
  LayerNode,
  LayerTree,
} from "../../hooks/useLayerTree.js";
import {
  canMoveLayer,
  LAYER_ROOT_ID,
  listFolders,
  useLayerActions,
} from "../../hooks/useLayerTree.js";
import styles from "./LayersPanel.module.css";

const INDENT_PX = 16;

interface LayerDropTarget {
  readonly id: RecordId;
  readonly position: LayerDropPosition;
}

interface LayerDrag {
  readonly dropTarget: LayerDropTarget | undefined;
  readonly drop: (target: LayerDropTarget) => void;
  readonly end: () => void;
  /** Shows where the dragged layer would land, and returns whether it can land there. */
  readonly over: (target: LayerDropTarget) => boolean;
  readonly start: (id: RecordId) => void;
}

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

  // A ref, since nothing renders differently for the dragged row.
  const draggedIdRef = useRef<RecordId>();
  const [dropTarget, setDropTarget] = useState<LayerDropTarget>();
  const endDrag = () => {
    draggedIdRef.current = undefined;
    setDropTarget(undefined);
  };
  const drag: LayerDrag = {
    dropTarget,
    drop: target => {
      if (draggedIdRef.current != null) {
        actions.moveLayer(draggedIdRef.current, target.id, target.position);
      }
      // The dropped row may remount in its new folder, which skips its dragend.
      endDrag();
    },
    end: endDrag,
    over: target => {
      const draggedId = draggedIdRef.current;
      const canDrop = draggedId != null
        && canMoveLayer(tree, draggedId, target.id, target.position);
      setDropTarget(prev =>
        !canDrop
          ? undefined
          : prev?.id === target.id && prev.position === target.position
          ? prev
          : target
      );
      return canDrop;
    },
    start: id => {
      draggedIdRef.current = id;
    },
  };

  return (
    <aside
      className={styles.panel}
      onDragLeave={e => {
        // Crossing between rows also fires dragleave; only leaving the panel clears the target.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropTarget(undefined);
        }
      }}
    >
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
            drag={drag}
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
  readonly drag: LayerDrag;
  readonly folderOptions: readonly OptionProps<string>[];
  readonly isParentVisible: boolean;
  /** In drawing order, bottom first. */
  readonly nodes: readonly LayerNode[];
  readonly parentId: RecordId;
}

function LayerList({ nodes, ...rowProps }: LayerListProps) {
  // The top layer is listed first, so the panel reads in reverse drawing order.
  return (
    <ul className={styles.list}>
      {[...nodes].reverse().map(node => <LayerRow {...rowProps} key={node.id} node={node} />)}
    </ul>
  );
}

interface LayerRowProps extends Omit<LayerListProps, "nodes"> {
  readonly node: LayerNode;
}

function LayerRow({
  actions,
  depth,
  drag,
  folderOptions,
  isParentVisible,
  node,
  parentId,
}: LayerRowProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const isShown = isParentVisible && node.visible;
  const indent = 8 + depth * INDENT_PX;
  const dropPosition = drag.dropTarget?.id === node.id ? drag.dropTarget.position : undefined;
  const getDropTarget = (e: DragEvent<HTMLElement>): LayerDropTarget => ({
    id: node.id,
    position: getDropPosition(e, node.kind === "folder"),
  });

  return (
    <li className={styles.item}>
      {(dropPosition === "above" || dropPosition === "below") && (
        // Below a folder means below all of its contents, so the line goes under them.
        <div
          className={`${styles.dropLine} ${
            dropPosition === "above" ? styles.dropLineAbove : styles.dropLineBelow
          }`}
          style={{ left: indent }}
        />
      )}
      <div
        className={`${styles.row}${isShown ? "" : ` ${styles.hidden}`}${
          dropPosition === "inside" ? ` ${styles.dropInside}` : ""
        }`}
        draggable={!isRenaming}
        onDragEnd={drag.end}
        onDragOver={e => {
          if (drag.over(getDropTarget(e))) {
            e.preventDefault();
          }
        }}
        onDragStart={e => {
          e.dataTransfer.effectAllowed = "move";
          // Firefox only starts drags that carry data.
          e.dataTransfer.setData("text/plain", node.id);
          drag.start(node.id);
        }}
        onDrop={e => {
          e.preventDefault();
          drag.drop(getDropTarget(e));
        }}
        style={{ paddingLeft: indent }}
      >
        <Button
          icon={node.visible ? "eye-open" : "eye-off"}
          onClick={() => actions.setVisible(node, !node.visible)}
          size="small"
          title={node.visible ? "Hide" : "Show"}
          variant="minimal"
        />
        <LayerLabel
          isRenaming={isRenaming}
          node={node}
          onRenameEnd={name => {
            setIsRenaming(false);
            if (name != null) {
              actions.rename(node, name);
            }
          }}
          onRenameStart={() => setIsRenaming(true)}
        />
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
          drag={drag}
          folderOptions={folderOptions}
          isParentVisible={isShown}
          nodes={node.children}
          parentId={node.id}
        />
      )}
    </li>
  );
}

function getDropPosition(e: DragEvent<HTMLElement>, isFolder: boolean): LayerDropPosition {
  const { height, top } = e.currentTarget.getBoundingClientRect();
  const offset = (e.clientY - top) / height;
  // Folders take drops on their middle half; otherwise the nearer edge wins.
  if (isFolder && offset > 0.25 && offset < 0.75) {
    return "inside";
  }
  return offset < 0.5 ? "above" : "below";
}

interface LayerLabelProps {
  readonly isRenaming: boolean;
  readonly node: LayerNode;
  /** Called with the new name, or undefined if it is unchanged. */
  readonly onRenameEnd: (name: string | undefined) => void;
  readonly onRenameStart: () => void;
}

function LayerLabel({ node, ...nameProps }: LayerLabelProps) {
  switch (node.kind) {
    case "folder":
      return <LayerName {...nameProps} defaultName="Folder" icon="folder-close" name={node.name} />;
    case "shape":
      return <ShapeLabel {...nameProps} name={node.name} shapeRef={node.ref} />;
    case "stroke":
      return <LayerName {...nameProps} defaultName="Stroke" icon="draw" name={node.name} />;
  }
}

interface ShapeLabelProps extends Omit<LayerNameProps, "defaultName" | "icon"> {
  readonly shapeRef: RecordRef<typeof NodeShapeModel>;
}

function ShapeLabel({ shapeRef, ...nameProps }: ShapeLabelProps) {
  const shapeType = narrowKnownNodeShape(useRecord(shapeRef).data)?.shapeType;
  return (
    <LayerName
      {...nameProps}
      defaultName={shapeType === "circle" ? "Circle" : shapeType === "box" ? "Box" : "Shape"}
      icon={shapeType === "circle" ? "circle" : "square"}
    />
  );
}

interface LayerNameProps extends Omit<LayerLabelProps, "node"> {
  readonly defaultName: string;
  readonly icon: IconName;
  readonly name: string | undefined;
}

function LayerName({
  defaultName,
  icon,
  isRenaming,
  name,
  onRenameEnd,
  onRenameStart,
}: LayerNameProps) {
  // Clearing a name goes back to the default.
  const shownName = name || defaultName;
  return (
    <>
      <Icon className={styles.icon} icon={icon} />
      {isRenaming
        ? (
          <InputGroup
            autoFocus={true}
            className={styles.nameInput}
            defaultValue={shownName}
            onBlur={e => {
              const newName = e.currentTarget.value.trim();
              onRenameEnd(newName === shownName ? undefined : newName);
            }}
            onFocus={e => e.currentTarget.select()}
            onKeyDown={e => {
              if (e.key === "Escape") {
                e.currentTarget.value = shownName;
              }
              if (e.key === "Enter" || e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            size="small"
          />
        )
        : (
          <span
            className={styles.name}
            onDoubleClick={onRenameStart}
            title="Double-click to rename"
          >
            {shownName}
          </span>
        )}
    </>
  );
}
