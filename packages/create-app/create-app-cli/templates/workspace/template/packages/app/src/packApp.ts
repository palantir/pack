import { createClient } from "@osdk/client";
import { createPublicOauthClient } from "@osdk/oauth";
import { getPageEnvOrThrow, initPackApp } from "@palantir/pack.app";

// PACK's auth module type — provided here to show where authentication plugs in.
export type { AuthModule } from "@palantir/pack.auth";

// All configuration is read from the <meta> tags in index.html, which Vite fills
// from your `.env.local` at build/serve time. See `.env.example` for the full list.
// `getPageEnvOrThrow` throws a helpful error if a required value is missing.
const pageEnv = getPageEnvOrThrow();

const CLIENT_ID = pageEnv.clientId;
const FOUNDRY_URL = pageEnv.baseUrl;
const ONTOLOGY_RID = pageEnv.ontologyRid;
const REDIRECT_URL = pageEnv.redirectUrl ?? `${window.location.origin}/auth/callback`;

/** The document type name, sourced from the `pack-documentTypeName` meta tag. */
export const DOCUMENT_TYPE_NAME = pageEnv.documentTypeName;

// A public OAuth client for the browser. Configure the values in `.env.local`.
const authClient = createPublicOauthClient(CLIENT_ID, FOUNDRY_URL, REDIRECT_URL, {
  scopes: [
    "api:use-ontologies-read",
    "api:use-ontologies-write",
    "api:use-pack-read",
    "api:use-pack-write",
  ],
});

const osdkClient = createClient(FOUNDRY_URL, ONTOLOGY_RID, authClient);

/**
 * The shared PACK application instance. Built once and provided to the React tree
 * via `PackAppProvider` in `main.tsx`; read anywhere with `usePackApp()`.
 *
 * When no `pack-appId` meta tag is set, PACK uses the OAuth client id as the app id.
 */
export const app = initPackApp(osdkClient, {
  app: pageEnv.appId != null
    ? { appId: pageEnv.appId, appVersion: pageEnv.appVersion ?? undefined }
    : undefined,
  ontologyRid: ONTOLOGY_RID,
  logLevel: "info",
})
  .withState()
  .build();
