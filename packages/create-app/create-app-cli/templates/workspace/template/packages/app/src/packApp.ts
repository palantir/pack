import { createClient } from "@osdk/client";
import { createPublicOauthClient } from "@osdk/oauth";
import { initPackApp } from "@palantir/pack.app";

// PACK's auth module type — provided here to show where authentication plugs in.
export type { AuthModule } from "@palantir/pack.auth";

const FOUNDRY_URL = import.meta.env.VITE_FOUNDRY_API_URL ?? "";
const CLIENT_ID = import.meta.env.VITE_FOUNDRY_CLIENT_ID ?? "";
const ONTOLOGY_RID = import.meta.env.VITE_FOUNDRY_ONTOLOGY_RID ?? "";
const REDIRECT_URL = import.meta.env.VITE_FOUNDRY_REDIRECT_URL
  ?? `${window.location.origin}/auth/callback`;

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
 */
export const app = initPackApp(osdkClient, {
  ontologyRid: ONTOLOGY_RID,
  logLevel: "info",
})
  .withState()
  .build();
