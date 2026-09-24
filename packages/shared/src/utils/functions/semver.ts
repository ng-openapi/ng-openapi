/**
 * Strict MAJOR.MINOR.PATCH with optional pre-release and build parts —
 * deliberately narrower than what npm normalizes (no leading "v", no
 * leading zeros), so a version that passes is written to package.json as is.
 */
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** Determines if input is a semver version ("1.2.3", "2.0.0-beta.1"); ranges ("^1.0.0") and "v1.2.3" are not. */
export function isSemver(input: string): boolean {
    return SEMVER_PATTERN.test(input);
}
