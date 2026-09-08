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

import type { PackApp } from "@palantir/pack.core";
import type { Context, PropsWithChildren, ReactElement } from "react";
import { createContext, createElement, useContext } from "react";

export interface UsePackApp<TApp extends PackApp> {
  (): TApp;
  (throwOnMissing: true): TApp;
  (throwOnMissing: false): TApp | null;
}

export interface BoundPackAppContext<TApp extends PackApp> {
  readonly PackAppProvider: (props: PropsWithChildren) => ReactElement;
  readonly usePackApp: UsePackApp<TApp>;
}

export interface PackAppContext<TApp extends PackApp> {
  readonly PackAppProvider: (
    props: PropsWithChildren<{ readonly value: TApp }>,
  ) => ReactElement;
  readonly usePackApp: UsePackApp<TApp>;
}

/**
 * Creates a provider and hook that preserve all configured module accessor types.
 * Pass the app to bind it immediately, or specify its type when the app is created later.
 */
export function createPackAppContext<TApp extends PackApp>(): PackAppContext<TApp>;
export function createPackAppContext<TApp extends PackApp>(
  app: TApp,
): BoundPackAppContext<TApp>;
export function createPackAppContext<TApp extends PackApp>(
  app?: TApp,
): BoundPackAppContext<TApp> | PackAppContext<TApp> {
  const packContext = createContext<TApp | null>(null);
  const useTypedPackApp = createUsePackApp(packContext);

  if (app == null) {
    function PackAppValueProvider({
      children,
      value,
    }: PropsWithChildren<{ readonly value: TApp }>): ReactElement {
      return createElement(packContext.Provider, { value }, children);
    }

    return {
      PackAppProvider: PackAppValueProvider,
      usePackApp: useTypedPackApp,
    };
  }

  const boundApp = app;

  function BoundPackAppProvider({ children }: PropsWithChildren): ReactElement {
    return createElement(packContext.Provider, { value: boundApp }, children);
  }

  return {
    PackAppProvider: BoundPackAppProvider,
    usePackApp: useTypedPackApp,
  };
}

const PACK_CONTEXT = createContext<PackApp | null>(null);

// TODO: this should move to a pack.app.react package as it has nothing to do with state.
export function usePackApp(): PackApp;
export function usePackApp(throwOnMissing: true): PackApp;
export function usePackApp(throwOnMissing: false): PackApp | null;
export function usePackApp(throwOnMissing = true): PackApp | null {
  const packApp = useContext(PACK_CONTEXT);
  if (packApp == null && throwOnMissing) {
    throw new Error("usePackApp must be used within a PackApp provider");
  }
  return packApp;
}

export const PackAppProvider: React.Provider<PackApp | null> = PACK_CONTEXT.Provider;

function createUsePackApp<TApp extends PackApp>(
  packContext: Context<TApp | null>,
): UsePackApp<TApp> {
  function useTypedPackApp(): TApp;
  function useTypedPackApp(throwOnMissing: true): TApp;
  function useTypedPackApp(throwOnMissing: false): TApp | null;
  function useTypedPackApp(throwOnMissing = true): TApp | null {
    const packApp = useContext(packContext);
    if (packApp == null && throwOnMissing) {
      throw new Error("usePackApp must be used within a PackApp provider");
    }
    return packApp;
  }

  return useTypedPackApp;
}
