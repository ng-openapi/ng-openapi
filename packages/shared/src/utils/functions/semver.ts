/** MAJOR.MINOR.PATCH with optional pre-release and build parts — a version npm will accept on publish. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** Determines if input is a semver version ("1.2.3", "2.0.0-beta.1"); ranges ("^1.0.0") are not. */
export function isSemver(input: string): boolean {
    return SEMVER_PATTERN.test(input);
}
