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

/** Angular Package Format requires tslib as a runtime dependency when `importHelpers` is on. */
export const TSLIB_RANGE = "^2.3.0";

/** The leading major of a version or range ("21.2.13" → 21, "^20.0.0" → 20, ">=19 <22" → 19). */
export function leadingMajor(versionOrRange: string): number | undefined {
    const match = /\d+/.exec(versionOrRange);
    return match ? parseInt(match[0], 10) : undefined;
}
