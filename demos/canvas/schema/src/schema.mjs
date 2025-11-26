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

import * as S from "@palantir/pack.schema";

// @ts-check

const SHAPE_COMMON = {
  bottom: S.Double,
  left: S.Double,
  right: S.Double,
  top: S.Double,

  color: S.Optional(S.String),
};

const migration000 = S.defineMigration({}, () => {
  const ShapeCircle = S.defineRecord("ShapeCircle", {
    docs: "A circle.",
    fields: SHAPE_COMMON,
  });

  const ShapeBox = S.defineRecord("ShapeBox", {
    docs: "A box.",
    fields: SHAPE_COMMON,
  });

  const NodeShape = S.defineUnion("NodeShape", {
    discriminant: "shapeType",
    docs: "The shape of a node.",
    variants: {
      "box": ShapeBox,
      "circle": ShapeCircle,
    },
  });

  return {
    NodeShape,
    ShapeBox,
    ShapeCircle,
  };
});

export default migration000;
