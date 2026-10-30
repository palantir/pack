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

import type {
  LayerFolder,
  LayerItem,
  LayerRoot,
  VersionedDocRef,
  VersionedDocRef_v4,
} from "@demo/canvas.sdk";
import {
  FreehandStrokeModel,
  LayerFolderModel,
  LayerItemModel,
  LayerRootModel,
  matchVersion,
  NodeShapeModel,
} from "@demo/canvas.sdk";
import { generateId } from "@palantir/pack.core";
import type {
  DocumentRef,
  Model,
  ModelData,
  RecordId,
  RecordRef,
} from "@palantir/pack.document-schema.model-types";
import { useRecords } from "@palantir/pack.state.react";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Record id of the single LayerRoot record, and the parent id of top-level layers. */
export const LAYER_ROOT_ID = "root" as RecordId;

export type LayerItemNode =
  | {
    readonly kind: "shape";
    readonly id: RecordId;
    readonly ref: RecordRef<typeof NodeShapeModel>;
    readonly visible: boolean;
  }
  | {
    readonly kind: "stroke";
    readonly id: RecordId;
    readonly ref: RecordRef<typeof FreehandStrokeModel>;
    readonly visible: boolean;
  };

export interface LayerFolderNode {
  readonly kind: "folder";
  readonly id: RecordId;
  readonly name: string;
  readonly visible: boolean;
  /** In drawing order, bottom first. */
  readonly children: readonly LayerNode[];
}

export type LayerNode = LayerFolderNode | LayerItemNode;

export interface LayerTree {
  /** Top-level layers in drawing order, bottom first. */
  readonly roots: readonly LayerNode[];
  /** Items to draw, bottom first: hidden items and the contents of hidden folders are left out. */
  readonly visibleItems: readonly LayerItemNode[];
  /** Index of each item in `visibleItems`. Hidden items have no rank. */
  readonly drawRankById: ReadonlyMap<RecordId, number>;
  /** Parent of every layer; top-level layers map to {@link LAYER_ROOT_ID}. */
  readonly parentIdById: ReadonlyMap<RecordId, RecordId>;
  /** Child ids of the root and of every folder, as shown. */
  readonly childIdsByParentId: ReadonlyMap<RecordId, readonly RecordId[]>;
}

export type LayerDirection = "backward" | "forward";

export interface LayerActions {
  readonly addFolder: (parentId: RecordId) => void;
  /** Deletes the folder and moves its contents into its parent, in its place. */
  readonly deleteFolder: (folderId: RecordId) => void;
  readonly moveLayer: (id: RecordId, direction: LayerDirection) => void;
  readonly moveToFolder: (id: RecordId, folderId: RecordId) => void;
  readonly setVisible: (node: LayerNode, visible: boolean) => void;
}

export function useLayerTree(doc: DocumentRef): LayerTree {
  const shapeRefs = useRecords(doc, NodeShapeModel);
  const strokeRefs = useRecords(doc, FreehandStrokeModel);
  const folders = useRecordSnapshots(useRecords(doc, LayerFolderModel));
  const items = useRecordSnapshots(useRecords(doc, LayerItemModel));
  const roots = useRecordSnapshots(useRecords(doc, LayerRootModel));

  return useMemo(
    () => buildLayerTree(roots.get(LAYER_ROOT_ID), folders, items, shapeRefs, strokeRefs),
    [folders, items, roots, shapeRefs, strokeRefs],
  );
}

export function useLayerActions(doc: VersionedDocRef, tree: LayerTree): LayerActions {
  const addFolder = useCallback(
    (parentId: RecordId) => {
      const id = `folder-${generateId()}` as RecordId;
      const name = `Folder ${listFolders(tree.roots).length + 1}`;
      editLayers(doc, doc => {
        void doc.setRecord(LayerFolderModel, id, { childIds: [], name, visible: true });
        setChildIds(doc, parentId, [...getChildIds(tree, parentId), id]);
      });
    },
    [doc, tree],
  );

  const deleteFolder = useCallback(
    (folderId: RecordId) => {
      const parentId = tree.parentIdById.get(folderId);
      const folderRef = doc.getRecords(LayerFolderModel).get(folderId);
      if (parentId == null || folderRef == null) return;

      const siblingIds = getChildIds(tree, parentId).flatMap(childId =>
        childId === folderId ? getChildIds(tree, folderId) : [childId]
      );
      editLayers(doc, doc => {
        setChildIds(doc, parentId, siblingIds);
        void doc.deleteRecord(folderRef);
      });
    },
    [doc, tree],
  );

  const moveLayer = useCallback(
    (id: RecordId, direction: LayerDirection) => {
      const parentId = tree.parentIdById.get(id);
      if (parentId == null) return;

      const siblingIds = [...getChildIds(tree, parentId)];
      const index = siblingIds.indexOf(id);
      const targetIndex = direction === "forward" ? index + 1 : index - 1;
      const targetId = siblingIds[targetIndex];
      if (index === -1 || targetId == null) return;

      siblingIds[targetIndex] = id;
      siblingIds[index] = targetId;
      editLayers(doc, doc => setChildIds(doc, parentId, siblingIds));
    },
    [doc, tree],
  );

  const moveToFolder = useCallback(
    (id: RecordId, folderId: RecordId) => {
      const parentId = tree.parentIdById.get(id);
      if (parentId == null || parentId === folderId) return;

      editLayers(doc, doc => {
        setChildIds(doc, parentId, getChildIds(tree, parentId).filter(childId => childId !== id));
        setChildIds(doc, folderId, [...getChildIds(tree, folderId), id]);
      });
    },
    [doc, tree],
  );

  const setVisible = useCallback(
    (node: LayerNode, visible: boolean) => {
      editLayers(doc, doc => {
        if (node.kind === "folder") {
          const folderRef = doc.getRecords(LayerFolderModel).get(node.id);
          if (folderRef != null) {
            void doc.updateRecord(folderRef, { visible });
          }
        } else {
          void doc.setRecord(LayerItemModel, getLayerItemId(node.id), { visible });
        }
      });
    },
    [doc],
  );

  return { addFolder, deleteFolder, moveLayer, moveToFolder, setVisible };
}

/** Every folder in the tree, in panel order (top first), with its nesting depth. */
export function listFolders(
  nodes: readonly LayerNode[],
  depth = 0,
): { readonly depth: number; readonly folder: LayerFolderNode }[] {
  return [...nodes].reverse().flatMap(node =>
    node.kind === "folder"
      ? [{ depth, folder: node }, ...listFolders(node.children, depth + 1)]
      : []
  );
}

function buildLayerTree(
  root: LayerRoot | undefined,
  folders: ReadonlyMap<RecordId, LayerFolder>,
  items: ReadonlyMap<RecordId, LayerItem>,
  shapeRefs: readonly RecordRef<typeof NodeShapeModel>[],
  strokeRefs: readonly RecordRef<typeof FreehandStrokeModel>[],
): LayerTree {
  const shapeRefById = new Map(shapeRefs.map(ref => [ref.id, ref]));
  const strokeRefById = new Map(strokeRefs.map(ref => [ref.id, ref]));
  const parentIdById = new Map<RecordId, RecordId>();
  const childIdsByParentId = new Map<RecordId, readonly RecordId[]>();

  const toNode = (id: RecordId, parentId: RecordId): LayerNode | undefined => {
    const folder = folders.get(id);
    if (folder != null) {
      // Set before visiting children, so a folder that contains itself is only placed once.
      parentIdById.set(id, parentId);
      return {
        children: toNodes(id, folder.childIds as readonly RecordId[]),
        id,
        kind: "folder",
        name: folder.name,
        visible: folder.visible,
      };
    }

    const visible = items.get(getLayerItemId(id))?.visible ?? true;
    const shapeRef = shapeRefById.get(id);
    if (shapeRef != null) {
      parentIdById.set(id, parentId);
      return { id, kind: "shape", ref: shapeRef, visible };
    }
    const strokeRef = strokeRefById.get(id);
    if (strokeRef != null) {
      parentIdById.set(id, parentId);
      return { id, kind: "stroke", ref: strokeRef, visible };
    }
    // Deleted, possibly by another user; dropped from the list on its parent's next edit.
    return undefined;
  };

  const toNodes = (parentId: RecordId, childIds: readonly RecordId[]): LayerNode[] => {
    const nodes = childIds.flatMap(childId =>
      // Concurrent moves can list a layer in two places: the first one wins.
      parentIdById.has(childId) ? [] : toNode(childId, parentId) ?? []
    );
    childIdsByParentId.set(parentId, nodes.map(node => node.id));
    return nodes;
  };

  // Anything not reachable from the root is drawn on top of it: items created before the
  // document had layers (or by older clients), and folders orphaned by concurrent edits.
  // With no layers, this draws strokes then shapes, as the canvas did before.
  const roots = toNodes(LAYER_ROOT_ID, [
    ...(root?.childIds ?? []) as readonly RecordId[],
    ...folders.keys(),
    ...strokeRefs.map(ref => ref.id),
    ...shapeRefs.map(ref => ref.id),
  ]);

  const visibleItems: LayerItemNode[] = [];
  const collectVisibleItems = (nodes: readonly LayerNode[]) => {
    for (const node of nodes) {
      if (!node.visible) continue;
      if (node.kind === "folder") {
        collectVisibleItems(node.children);
      } else {
        visibleItems.push(node);
      }
    }
  };
  collectVisibleItems(roots);

  return {
    childIdsByParentId,
    drawRankById: new Map(visibleItems.map((item, index) => [item.id, index])),
    parentIdById,
    roots,
    visibleItems,
  };
}

// Record ids must be unique across all of a document's models, so a LayerItem can't reuse its item's id.
function getLayerItemId(itemId: RecordId): RecordId {
  return `layer-${itemId}` as RecordId;
}

function getChildIds(tree: LayerTree, parentId: RecordId): readonly RecordId[] {
  return tree.childIdsByParentId.get(parentId) ?? [];
}

function editLayers(doc: VersionedDocRef, edit: (doc: VersionedDocRef_v4) => void): void {
  matchVersion(doc, {
    1: () => {/* Layers do not exist in v1 */},
    2: () => {/* Layers do not exist in v2 */},
    3: () => {/* Layers do not exist in v3 */},
    4: doc => doc.withTransaction(() => edit(doc)),
  });
}

// Writes the whole list: arrays are stored as a Y.Array that is replaced on every update.
function setChildIds(
  doc: VersionedDocRef_v4,
  parentId: RecordId,
  childIds: readonly RecordId[],
): void {
  if (parentId === LAYER_ROOT_ID) {
    void doc.setRecord(LayerRootModel, LAYER_ROOT_ID, { childIds });
    return;
  }
  const folderRef = doc.getRecords(LayerFolderModel).get(parentId);
  if (folderRef != null) {
    void doc.updateRecord(folderRef, { childIds });
  }
}

const EMPTY_SNAPSHOTS: ReadonlyMap<RecordId, never> = new Map<RecordId, never>();

/** The latest data of each record, keyed by id. */
function useRecordSnapshots<M extends Model>(
  refs: readonly RecordRef<M>[],
): ReadonlyMap<RecordId, ModelData<M>> {
  const [snapshots, setSnapshots] = useState<ReadonlyMap<RecordId, ModelData<M>>>(
    EMPTY_SNAPSHOTS,
  );

  useEffect(() => {
    const ids = new Set(refs.map(ref => ref.id));
    setSnapshots(prev => new Map([...prev].filter(([id]) => ids.has(id))));

    // onChange delivers the current snapshot immediately, then every later change.
    const unsubscribes = refs.map(ref =>
      ref.onChange(snapshot => {
        setSnapshots(prev => new Map(prev).set(ref.id, snapshot));
      })
    );
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [refs]);

  return snapshots;
}
