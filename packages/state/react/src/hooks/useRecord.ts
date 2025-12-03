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

import type { Model, ModelData, RecordRef } from "@palantir/pack.document-schema.model-types";
import { useEffect, useState } from "react";

interface Return<M extends Model> {
  data: ModelData<M> | undefined;
  isLoading: boolean;
}

/**
 * Subscribes to an individual record and subscribes to its changes.
 *
 * @param ref The record to subscribe to.
 * @returns The latest data and loading state.
 * @example
 * ```tsx
 * import { useDocRef, useRecord } from "@palantir/pack.state.react";
 * import { DocumentSchema, MyModel } from "@myapp/schema";
 * import { app } from "./appInstance";
 *
 * const MyComponent: React.FC<{ recordRef: RecordRef<MyModel> }> = ({ recordRef }) => {
 *   const { data, isLoading } = useRecord(recordRef);
 *
 *   if (isLoading) {
 *     return <Spinner />;
 *   }
 *
 *   if (data == null) {
 *     return <div>Record not found</div>;
 *   }
 *
 *   return <div>Hello, {data.myFieldName}</div>;
 * }
 */
export function useRecord<M extends Model>(
  ref: RecordRef<M>,
): Return<M> {
  const [data, setData] = useState<ModelData<Model>>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeToOnChange = ref.onChange(newSnapshot => {
      setIsLoading(false);
      setData(newSnapshot);
    });

    const unsubscribeToOnDeleted = ref.onDeleted(() => {
      setIsLoading(false);
      setData(undefined);
    });

    return () => {
      setData(undefined);
      unsubscribeToOnChange();
      unsubscribeToOnDeleted();
    };
  }, [ref]);
  return { data, isLoading };
}
