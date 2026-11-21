import { createRequire } from "module";
import * as path from "path";
import { describeOperation, NormalizedSpec } from "@ng-openapi/shared";

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

/** The first Angular release with the `@Service()` decorator. */
export const SERVICE_DECORATOR_MIN_ANGULAR = { major: 22, minor: 0 } as const;

/**
 * The first Angular release whose HttpClient knows the HTTP QUERY method: it
 * added `HttpClient.query()`, stopped attaching the XSRF token to QUERY
 * requests, and started reusing their responses from the SSR transfer cache.
 */
export const QUERY_METHOD_MIN_ANGULAR = { major: 22, minor: 3 } as const;

/**
 * Whether `version` is older than `minimum`. A prerelease counts as the
 * release it leads up to (`22.3.0-rc.0` is not below 22.3), and a version
 * that cannot be read is not below anything: unknown must never warn.
 */
export function isAngularVersionBelow(version: string, minimum: { major: number; minor: number }): boolean {
    const match = /^(\d+)\.(\d+)/.exec(version);
    if (!match) {
        return false;
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return major < minimum.major || (major === minimum.major && minor < minimum.minor);
}

/**
 * The warning for a spec with QUERY operations generated in a workspace whose
 * Angular predates QUERY support, or undefined when there is nothing to say —
 * no QUERY operation, a recent enough Angular, or one that could not be
 * detected.
 *
 * It says what the consumer will actually see: the generated code goes through
 * `HttpClient.request()` and `httpResource`, both of which take the method as
 * a string, so it compiles and sends the request on any version. What an older
 * HttpClient gets wrong is the handling around it.
 */
export function describeQueryMethodSupport(
    spec: Pick<NormalizedSpec, "operations">,
    angularVersion: string | undefined,
): string | undefined {
    const queryOperations = spec.operations.filter((operation) => operation.method === "QUERY");
    if (queryOperations.length === 0 || angularVersion === undefined) {
        return undefined;
    }
    if (!isAngularVersionBelow(angularVersion, QUERY_METHOD_MIN_ANGULAR)) {
        return undefined;
    }
    const first = describeOperation(queryOperations[0]);
    const subject =
        queryOperations.length === 1
            ? `Operation ${first} uses`
            : `${queryOperations.length} operations (the first is ${first}) use`;
    const minimum = `${QUERY_METHOD_MIN_ANGULAR.major}.${QUERY_METHOD_MIN_ANGULAR.minor}`;
    return (
        `${subject} the HTTP QUERY method, which Angular's HttpClient supports from ${minimum} — ` +
        `found @angular/core ${angularVersion} in this workspace. The generated code still compiles and sends ` +
        `the request there, but HttpClient treats it as a mutation: it attaches the XSRF token to it, and ` +
        `server-side rendering does not reuse its response during hydration.`
    );
}
