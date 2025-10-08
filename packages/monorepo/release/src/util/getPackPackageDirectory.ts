import { join } from "path";

const PACKAGE_NAME_PREFIX = "@palantir/pack.";

/** 
 * Returns the directory of the package with the given name.
 * e.g. `@palantir/pack.monorepo.release` -> `packages/monorepo/release`
 */
export function getPackPackageDirectory(packageName: string): string {
    const packageDirectory = packageName.replace(PACKAGE_NAME_PREFIX, "");
    return join("packages", ...packageDirectory.split("."));
}