# Canvas README Doc Update

Intent: refresh the canvas demo README so setup instructions match the current app behavior.

Main points:

- Clarify quick start, local HTTPS, and the two run modes.
- Add repo-level prerequisites for Node.js and pnpm.
- Document local env override files, filesystem configuration, and Compass parent folder requirements.
- Add Foundry setup details for filesystem scopes, document type configuration, and security.
- Explain `demos/canvas/schema/pack-config.json`, the schema-to-IR-to-SDK pipeline, and the included SDK build script.
- Clarify that `VITE_PACK_DOCUMENT_TYPE_NAME`, `pack-config.json`, Foundry registration, and the generated SDK constant should line up.
- Note that real-backend testing requires manually deploying the document type before creating documents.
- Add schema-to-SDK regeneration commands for changes under `demos/canvas/schema`.

This change is docs-only. It intentionally does not modify the existing canvas env defaults.
