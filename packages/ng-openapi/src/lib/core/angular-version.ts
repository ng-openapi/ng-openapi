import { createRequire } from "module";
import * as path from "path";

/**
 * Best-effort detection of the workspace's installed @angular/core version.
 * Returns undefined when @angular/core is not resolvable from `from`
 * (monorepo roots, CI runs without the app's dependencies installed,
 * generating for a different project) — callers must treat that as
 * "unknown", never as an error.
 */
export function detectAngularCoreVersion(from: string = process.cwd()): string | undefined {
    try {
        // createRequire instead of bare require: this module ships as both CJS and ESM
        const requireFrom = createRequire(path.join(from, "package.json"));
        const pkg = requireFrom("@angular/core/package.json") as { version?: string };
        return typeof pkg.version === "string" ? pkg.version : undefined;
    } catch {
        return undefined;
    }
}
