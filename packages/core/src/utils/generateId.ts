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

function toHexString(byteArray: Int8Array) {
  return Array.from(byteArray, function(byte) {
    const h = (byte & 0xff).toString(16);
    return h.length === 1 ? `0${h}` : h;
  }).join("");
}

export function generateId(bytes = 12): string {
  const array = new Int8Array(bytes);
  const r = crypto.getRandomValues(array);
  return toHexString(r);
}
