import { getAuthModule } from "@palantir/pack.auth";
import { useEffect, useState } from "react";
import { app } from "./packApp.js";

/**
 * Component to render at `/auth/callback`.
 *
 * This calls `signIn()` again to save the token returned by Foundry, then
 * navigates the user back to the home page.
 */
export function AuthCallback(): React.JSX.Element {
  const [error, setError] = useState<string | undefined>(undefined);

  // This effect conflicts with React 18 strict mode in development
  // https://react.dev/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development
  useEffect(() => {
    void (async () => {
      try {
        await getAuthModule(app).signIn();
        window.location.replace("/");
      } catch (e: unknown) {
        setError((e as Error).message ?? (e as string));
      }
    })();
  }, []);
  return <div>{error != null ? error : "Authenticating…"}</div>;
}
