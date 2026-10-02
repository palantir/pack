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

export function createLargePayloadTestShape(base64Characters: number) {
  // Base64 expands ASCII by 4/3; Yjs and JSON add a small amount.
  const payloadCharacters = base64Characters * 3 / 4;

  return {
    bottom: 220,
    left: 100,
    right: 260,
    shapeType: "box" as const,
    testPayload: "x".repeat(payloadCharacters),
    top: 100,
  };
}
