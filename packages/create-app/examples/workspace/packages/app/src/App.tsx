import { usePackApp } from "@palantir/pack.state.react";

// Once you have run `npm run sdk-gen`, import your generated models from the SDK,
// e.g.:
//   import { DocumentModel } from "@example/todo.sdk";

export function App(): React.JSX.Element {
  const app = usePackApp();
  const documentTypeName = import.meta.env.VITE_PACK_DOCUMENT_TYPE_NAME
    ?? "your document type";

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.5 }}>
      <h1>workspace</h1>
      <p>Your PACK application is wired up and ready.</p>
      <ul>
        <li>Document type: <code>{documentTypeName}</code></li>
        <li>PACK app: <code>{app != null ? "ready" : "unavailable"}</code></li>
      </ul>
      <p>
        Next, edit <code>packages/schema/src/schema.mjs</code>, run{" "}
        <code>npm run sdk-gen</code>, then import your generated models from{" "}
        <code>@example/todo.sdk</code> and start building.
      </p>
    </main>
  );
}
