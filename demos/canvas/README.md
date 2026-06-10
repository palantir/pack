# Canvas Demo

A demo application showcasing Pack's features for collaborative document editing with a canvas-based interface.

## Quick Start

Prerequisites:

- Node.js 20 or newer. The repo's version-manager files currently select Node
  22.x, which also satisfies the root `package.json` engine requirement.
- pnpm 10.27.0.

From the repository root:

```bash
pnpm install
```

Then start the demo:

```bash
pnpm demo:canvas
```

This watches the Pack libraries and runs the demo app at `https://localhost:5173`.
The dev server uses a local HTTPS certificate, so your browser may ask you to
trust it the first time you open the app.

## Running Modes

The demo can run against either in-memory demo state or a real Foundry backend.
Use a local env override to choose the mode you want.

### Demo Mode

Demo mode uses:

- Mock authentication (no real OAuth flow)
- In-memory document storage (changes are lost on refresh)
- Simulated API responses

This is useful for exploring the UI and testing frontend changes without a
Foundry instance. Set `VITE_DEMO_MODE=true` in your local env file and keep the
required page env values populated with non-placeholder values.

### Real Foundry Backend

To connect to a real Foundry instance, you need to:

1. Create a local env file (`.env.development.local`) in `demos/canvas/app/`
2. Configure your Foundry credentials
3. Set up a Third Party Application (TPA) in Foundry
4. Configure the document type, filesystem mode, and security settings

## Configuration

### Environment Files

| File                            | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `.env.development`              | Checked-in development defaults                           |
| `.env.development.local`        | Local development overrides, ignored by git               |
| `.env.development.local.sample` | Sample local development override for a real backend      |
| `.env.local`                    | Local overrides for all modes, ignored by git             |
| `.env.example`                  | Template showing the common environment variables         |
| `.env.production`               | In-memory values used for production-style local previews |

For day-to-day development, prefer copying `.env.development.local.sample` to
`.env.development.local` and editing the copy. Vite gives local env files
precedence over the checked-in defaults.

### Environment Variables

#### Core Settings

| Variable                       | Required         | Description                                                                           |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| `VITE_DEMO_MODE`               | No               | Set to `true` for in-memory demo state or `false` for a real Foundry backend.         |
| `VITE_FOUNDRY_URL`             | Yes              | Foundry stack URL, or a non-placeholder local value in demo mode.                     |
| `VITE_FOUNDRY_API_URL`         | For real backend | Foundry API URL used by the Vite proxy. Usually the same stack URL.                   |
| `VITE_FOUNDRY_CLIENT_ID`       | Yes              | OAuth Client ID from your Foundry TPA, or a non-placeholder local value in demo mode. |
| `VITE_FOUNDRY_REDIRECT_URL`    | For real backend | OAuth callback URL. Defaults to `https://localhost:5173/auth/callback`.               |
| `VITE_FOUNDRY_ONTOLOGY_RID`    | Yes              | Ontology RID, or a non-placeholder local value in demo mode.                          |
| `VITE_PACK_DOCUMENT_TYPE_NAME` | Yes              | Document type name registered in Foundry. Should match `pack-config.json`.            |
| `VITE_PACK_FILE_SYSTEM_TYPE`   | No               | `ARTIFACTS` by default. Set to `COMPASS` for Compass-backed documents.                |
| `VITE_PACK_PARENT_FOLDER_RID`  | For Compass      | Compass folder RID where new documents are created. Required for `COMPASS`.           |

#### Optional Settings

| Variable                 | Default     | Description                                                 |
| ------------------------ | ----------- | ----------------------------------------------------------- |
| `DEV_SERVER_PORT`        | `5173`      | Local dev server port                                       |
| `DEV_SERVER_HOST`        | `localhost` | Local dev server host                                       |
| `VITE_DEV_FOUNDRY_TOKEN` | -           | Skip OAuth by providing a token directly (development only) |

### Example: Connecting to a Real Foundry Backend

Create `demos/canvas/app/.env.development.local`:

```properties
# Disable demo mode to use real Foundry
VITE_DEMO_MODE=false

# Your Foundry stack URL
VITE_FOUNDRY_URL=https://your-stack.palantircloud.com
VITE_FOUNDRY_API_URL=https://your-stack.palantircloud.com

# OAuth configuration (from your TPA)
VITE_FOUNDRY_CLIENT_ID=your-client-id-here
VITE_FOUNDRY_REDIRECT_URL=https://localhost:5173/auth/callback

# Your ontology RID
VITE_FOUNDRY_ONTOLOGY_RID=ri.ontology.main.ontology.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Document type name (must match pack-config.json and the Foundry registration)
VITE_PACK_DOCUMENT_TYPE_NAME=your-document-type

# Filesystem configuration
VITE_PACK_FILE_SYSTEM_TYPE=ARTIFACTS
VITE_PACK_PARENT_FOLDER_RID=
```

For Compass-backed documents, use `VITE_PACK_FILE_SYSTEM_TYPE=COMPASS` and set
`VITE_PACK_PARENT_FOLDER_RID` to the target Compass folder RID.

## Foundry Setup

### 1. Create a Third Party Application (TPA)

In Foundry, navigate to **Control Panel > Third-party applications** and create a new application:

1. **Application type**: Public (client-side)
2. **Redirect URLs**: Add `https://localhost:5173/auth/callback`
3. **Required scopes** - Enable the following:
   - `api:use-admin-read`
   - `api:use-admin-write`
   - `api:use-mediasets-read`
   - `api:use-mediasets-write`
   - `api:use-ontologies-read`
   - `api:use-ontologies-write`
   - `api:use-pack-read` (check your environment for availability)
   - `api:use-pack-write` (check your environment for availability)

Copy the **Client ID** to your local env file.

### 2. Configure the Document Type

Set `VITE_PACK_DOCUMENT_TYPE_NAME` to the document type registered in Foundry.
This should match `documentTypeName` in `demos/canvas/schema/pack-config.json`.
The generated SDK also emits this value as `DOCUMENT_TYPE_NAME`, so app code can
use the SDK constant as the code-level source of truth when runtime env
overrides are not needed.

To test the demo app against a real backend with your own document type,
manually deploy the document type to Foundry first. The app creates documents
by document type name, so create will fail if that type has not been registered in the target stack.

From the repository root, run:

```bash
pnpm --filter @demo/canvas.schema deploy:document-type
```

This script reads the same app env files used by the Vite dev server, builds
the current schema IR, and deploys the document type to `VITE_FOUNDRY_URL`
using `VITE_DEV_FOUNDRY_TOKEN`.

Use `VITE_PACK_FILE_SYSTEM_TYPE=ARTIFACTS` for artifact-backed documents. Use
`VITE_PACK_FILE_SYSTEM_TYPE=COMPASS` for Compass-backed documents and provide
`VITE_PACK_PARENT_FOLDER_RID`.

### 3. Configure Document Security

When creating documents, the app requires security settings. Edit [CreateCanvasDialog.tsx](app/src/components/home/CreateCanvasDialog.tsx) to configure:

#### Mandatory Security (Classification)

Set your organization's classification labels:

```typescript
// Example: Single classification
const DEFAULT_CLASSIFICATION: readonly string[] = ["MU"];
```

The classification must be a valid marking from your Foundry instance.

#### Discretionary Security (Access Control)

For artifact-backed documents, optionally configure owners for document access:

```typescript
const DEFAULT_DOCUMENT_SECURITY = {
  discretionary: {
    owners: [{
      groupId: "your-group-uuid-here",
      type: "groupId",
    }],
  },
  mandatory: {
    classification: DEFAULT_CLASSIFICATION,
  },
};
```

For Compass-backed documents, leave discretionary security empty. Compass uses
folder permissions for owners, editors, and viewers.

## Schema and SDK Updates

The document schema lives in `demos/canvas/schema/src/schema.mjs`. The generated
SDK lives in `demos/canvas/sdk`.

The generation pipeline has two steps:

1. `build:ir` reads the schema source, such as
   `demos/canvas/schema/src/schema.mjs`, and `pack-config.json`, then writes
   `demos/canvas/schema/build/ir.json`.
2. `sdk-gen` reads that IR and `pack-config.json`, then regenerates the SDK in
   `demos/canvas/sdk`.

The IR is the handoff format between the schema package and SDK generation. It
captures the resolved document schema, document type metadata, and supported
schema version range. The SDK is generated from that IR so the app can import
typed models, schema helpers, and versioned document references from
`@demo/canvas.sdk`.

The schema package also has `demos/canvas/schema/pack-config.json`, which
provides metadata used when building the IR and generated SDK:

| Field                     | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `packageName`             | Name of the generated SDK package.                                       |
| `description`             | Description written into the generated SDK package metadata.             |
| `documentTypeName`        | Foundry Pack document type name emitted into the generated SDK constant. |
| `documentTypeDescription` | Description emitted for the Pack document type.                          |
| `minSupportedVersion`     | Oldest schema version this SDK supports. Omit it to support latest only. |

After changing the schema, regenerate the IR and SDK from the repository root:

```bash
pnpm --filter @demo/canvas.schema build:ir
pnpm --filter @demo/canvas.schema sdk-gen
```

The `sdk-gen` command is implemented by
`demos/canvas/schema/scripts/build-sdk.sh`. The script removes tracked generated
SDK source files first, then runs `pnpm exec sdkgen create` with the
`@palantir/pack.sdkgen.pack-versioned-template` template. This keeps removed
generated files visible in `git status`.

Then run the app or the relevant package checks before committing generated
changes.

## Troubleshooting

### Missing page environment meta tags

If startup fails with missing meta tags or placeholder values, check that your
local env file defines all required `VITE_*` values. The app reads these through
`demos/canvas/app/index.html`.

### "DEFAULT_CLASSIFICATION is not configured"

Edit `CreateCanvasDialog.tsx` and set a valid classification for your Foundry instance.

### "Parent folder RID is required for Compass filesystem"

Set `VITE_PACK_PARENT_FOLDER_RID` when `VITE_PACK_FILE_SYSTEM_TYPE=COMPASS`.

### OAuth redirect errors

Ensure:

- Your TPA's redirect URL exactly matches `VITE_FOUNDRY_REDIRECT_URL`
- You're using HTTPS (`https://localhost:5173`, not `http://`)
- The TPA has all required scopes enabled

### CORS or proxy errors

The Vite dev server proxies `/api/v2` requests to your Foundry instance. Verify `VITE_FOUNDRY_API_URL` is correct.

## Development

### Project Structure

```
demos/canvas/
├── app/                    # React application
│   ├── src/
│   │   ├── app.ts         # App initialization and auth setup
│   │   ├── components/    # React components
│   │   └── hooks/         # Custom React hooks
│   ├── .env.development               # Checked-in development defaults
│   └── .env.development.local.sample  # Template for local dev overrides
├── schema/                 # Document schema definition
└── sdk/                    # Generated OSDK client for canvas objects
```
