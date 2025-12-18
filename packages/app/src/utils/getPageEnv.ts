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

interface Return {
  appId: string | null;
  appVersion: string | null;
  baseUrl: string | null;
  clientId: string | null;
  ontologyRid: string | null;
  redirectUrl: string | null;
}

export function getPageEnv(): Return {
  const appId = getMetaTagContent("pack-appId");
  const appVersion = getMetaTagContent("pack-appVersion");
  const foundryUrl = getMetaTagContent("osdk-foundryUrl");
  const clientId = getMetaTagContent("osdk-clientId");
  const ontologyRid = getMetaTagContent("osdk-ontologyRid");
  const redirectUrl = getMetaTagContent("osdk-redirectUrl");
  return {
    appId,
    appVersion,
    baseUrl: foundryUrl,
    clientId,
    ontologyRid,
    redirectUrl,
  };
}

function getMetaTagContent(tagName: string): string | null {
  const elements = document.querySelectorAll(`meta[name="${tagName}"]`);
  const element = elements.item(elements.length - 1);

  const value = element?.getAttribute("content") ?? null;
  if (value?.match(/%.+%/)) {
    throw new Error(
      `Meta tag ${tagName} contains placeholder value. Please add ${
        value.replace(/%/g, "")
      } to your .env files`,
    );
  }
  return value;
}
