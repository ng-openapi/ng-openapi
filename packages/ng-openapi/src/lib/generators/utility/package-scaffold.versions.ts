/**
 * Version ranges written into a generated package's package.json. Kept in one
 * place so a bump is a one-line diff whose golden-snapshot fallout is the
 * review artifact; the ng-packagr smoke test proves the current set builds.
 */

/**
 * Angular major assumed when none is configured and none can be detected in
 * the workspace running the generator. Tracks the Angular this repo itself
 * builds and tests against (root package.json) — the one major the emitted
 * toolchain config is known to work with.
 */
export const DEFAULT_ANGULAR_MAJOR = 21;

/**
 * Oldest Angular the emitted toolchain config works with: the tsconfig uses
 * `moduleResolution: "bundler"`, which needs TypeScript 5 — Angular 16 is
 * the first major whose compiler accepts it (with the 16 → ~5.1.0 pin below).
 * Verified once by hand, not in CI: a generated package with
 * `angularVersion: "^16.0.0"` installed (compiler-cli 16.2.12, ng-packagr
 * 16.2.3, typescript 5.1.6) and built clean with ng-packagr on 2026-09-16.
 */
export const MIN_ANGULAR_MAJOR = 16;

/**
 * Stamped into the generated package.json so a later run can tell its own
 * file from one the user wrote — the scaffold refuses to overwrite the latter.
 */
export const PACKAGE_JSON_MARKER_KEY = "ngOpenapi";
export const PACKAGE_JSON_MARKER = { [PACKAGE_JSON_MARKER_KEY]: { generated: true } } as const;

/** Peer ranges for the packages generated code can import; anything else is pinned to "*" with a warning. */
export const KNOWN_PEER_RANGES: Readonly<Record<string, string>> = {
    rxjs: "^7.4.0",
    zod: "^4.0.0",
};

/** Build-time versions of the packages the ng-packagr toolchain needs beyond the Angular family. */
export const DEV_DEPENDENCY_RANGES: Readonly<Record<string, string>> = {
    rxjs: "^7.8.0",
    zod: "^4.0.0",
};

/**
 * TypeScript range per Angular major — the newest minor each major's
 * @angular/compiler-cli accepts, as a tilde range so `npm install` cannot
 * drift past it. Extend when a new Angular major ships; an unlisted major
 * gets no typescript devDependency (see buildDevDependencies).
 */
export const TYPESCRIPT_RANGE_BY_ANGULAR_MAJOR: Readonly<Record<number, string>> = {
    16: "~5.1.0",
    17: "~5.4.0",
    18: "~5.5.0",
    19: "~5.8.0",
    20: "~5.9.0",
    21: "~5.9.0",
    22: "~6.0.0",
};

/** Angular Package Format requires tslib as a runtime dependency when `importHelpers` is on. */
export const TSLIB_RANGE = "^2.3.0";

/** The leading major of a version or range ("21.2.13" → 21, "^20.0.0" → 20, ">=19 <22" → 19). */
export function leadingMajor(versionOrRange: string): number | undefined {
    const match = /\d+/.exec(versionOrRange);
    return match ? parseInt(match[0], 10) : undefined;
}
