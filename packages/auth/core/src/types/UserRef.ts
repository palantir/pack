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

import type { Flavored, PackAppInternal } from "@palantir/pack.core";
import type { AuthModule } from "./AuthModule.js";
import { getAuthModule } from "./AuthModule.js";

const UserRefBrand: unique symbol = Symbol("UserRef");
export type UserId = Flavored<"pack:UserId">;

/**
 * Reference to a user from the platform API.
 * Provides access to user information with caching.
 */
export interface UserRef {
  readonly userId: UserId;
  readonly [UserRefBrand]: typeof UserRefBrand;

  /**
   * Get the current user data from the platform API.
   * Results are cached to avoid excessive API calls.
   * @param force - Force refresh of cached data
   */
  readonly get: (force?: boolean) => Promise<unknown>;
}

const INVALID_USER_ID: UserId = "INVALID_USER_REF";
const INVALID_USER_REF: UserRef = Object.freeze(
  {
    userId: INVALID_USER_ID,
    [UserRefBrand]: UserRefBrand,
    get: () => Promise.reject(new Error("Invalid user reference")),
  } as const,
);

export function invalidUserRef(): UserRef {
  return INVALID_USER_REF;
}

export function isValidUserRef(userRef: UserRef): boolean {
  return userRef.userId !== INVALID_USER_ID && userRef.userId !== "";
}

export const createUserRef = (
  app: PackAppInternal,
  userId: UserId,
): UserRef => {
  return new UserRefImpl(app, userId);
};

class UserRefImpl implements UserRef {
  readonly userId: UserId;
  declare readonly [UserRefBrand]: typeof UserRefBrand;
  readonly #authModule: AuthModule;

  constructor(app: PackAppInternal, userId: UserId) {
    this.#authModule = getAuthModule(app);
    this.userId = userId;
  }

  get(force?: boolean): Promise<unknown> {
    return this.#authModule.getUserData(this.userId, force);
  }
}
