import {
    ConfigValidationError,
    GeneratorConfig,
    isPlainObject,
    isSemver,
    isUrl,
    PackageConfig,
} from "@ng-openapi/shared";
import { leadingMajor, MIN_ANGULAR_MAJOR } from "../generators/utility/package-scaffold.versions";

// Re-exported for hosts that import it from here; the class itself lives in
// shared/errors.ts so it joins the branded NgOpenApiError hierarchy.
export { ConfigValidationError };

const RESPONSE_TYPES = ["json", "blob", "arraybuffer", "text"] as const;

const NAMING_KEYS = ["services", "resources", "models"] as const;
// Decorations are spliced into generated identifiers, so they must be
// identifier fragments themselves; the prefix additionally starts the name.
const NAME_PREFIX_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_SUFFIX_PATTERN = /^[A-Za-z0-9_]*$/;

/**
 * Validates a config object at the user boundary (CLI config file or
 * programmatic call). Deliberately hand-rolled instead of a schema library:
 * the published CLI gains no runtime dependency, and the error messages can
 * name the exact accepted values.
 */
/** GeneratorConfig's keys with every value unknown — the not-yet-trusted view. */
type UnknownShape<T> = { [K in keyof T]?: unknown };

export function validateGeneratorConfig(config: unknown): asserts config is GeneratorConfig {
    if (!config || typeof config !== "object") {
        throw new ConfigValidationError(["config must be an object — see https://ng-openapi.dev for the shape"]);
    }

    const issues: string[] = [];
    const c = config as UnknownShape<GeneratorConfig>;

    if (typeof c.input !== "string" || c.input.trim() === "") {
        issues.push("`input` must be a non-empty string (path or URL of the OpenAPI/Swagger spec)");
    }
    if (typeof c.output !== "string" || c.output.trim() === "") {
        issues.push("`output` must be a non-empty string (output directory)");
    }
    // Free-form on purpose. It is not an identifier: identifiers derived from it
    // go through clientNameIdentifier and the token-name helpers, every comment
    // it reaches goes through escapeJsDoc, and every string literal through
    // quoteLiteral. Rejecting names such as "my-client" here broke configs that
    // generated fine before.
    if (c.clientName !== undefined && typeof c.clientName !== "string") {
        issues.push("`clientName` must be a string");
    }
    if (c.validateInput !== undefined && typeof c.validateInput !== "function") {
        issues.push("`validateInput` must be a function (spec) => boolean");
    }

    if (!c.options || typeof c.options !== "object") {
        issues.push("`options` must be an object with at least `dateType` and `enumStyle`");
    } else {
        const options = c.options as UnknownShape<GeneratorConfig["options"]>;

        if (options.dateType !== "string" && options.dateType !== "Date") {
            issues.push(`\`options.dateType\` must be "string" or "Date", got ${JSON.stringify(options.dateType)}`);
        }
        if (options.enumStyle !== "enum" && options.enumStyle !== "union") {
            issues.push(`\`options.enumStyle\` must be "enum" or "union", got ${JSON.stringify(options.enumStyle)}`);
        }
        if (
            options.serviceDecorator !== undefined &&
            options.serviceDecorator !== "injectable" &&
            options.serviceDecorator !== "service"
        ) {
            issues.push(
                `\`options.serviceDecorator\` must be "injectable" or "service", got ${JSON.stringify(options.serviceDecorator)}`,
            );
        }
        if (
            options.modelFileStructure !== undefined &&
            options.modelFileStructure !== "single" &&
            options.modelFileStructure !== "per-type"
        ) {
            issues.push(
                `\`options.modelFileStructure\` must be "single" or "per-type", got ${JSON.stringify(options.modelFileStructure)}`,
            );
        }

        const booleanKeys = [
            "generateServices",
            "generateEnumBasedOnDescription",
            "useSingleRequestParameter",
            "emitAcceptHeader",
        ] as const;
        for (const key of booleanKeys) {
            if (options[key] !== undefined && typeof options[key] !== "boolean") {
                issues.push(`\`options.${key}\` must be a boolean`);
            }
        }

        if (options.customizeMethodName !== undefined && typeof options.customizeMethodName !== "function") {
            issues.push("`options.customizeMethodName` must be a function (operationId) => string");
        }

        if (options.naming !== undefined) {
            if (typeof options.naming !== "object" || options.naming === null) {
                issues.push(
                    "`options.naming` must be an object like { services?: { prefix?, suffix? }, resources?: …, models?: … }",
                );
            } else {
                for (const key of NAMING_KEYS) {
                    const decoration = (options.naming as Record<string, unknown>)[key];
                    if (decoration === undefined) {
                        continue;
                    }
                    if (typeof decoration !== "object" || decoration === null) {
                        issues.push(
                            `\`options.naming.${key}\` must be an object like { prefix?: string, suffix?: string }`,
                        );
                        continue;
                    }
                    const { prefix, suffix } = decoration as { prefix?: unknown; suffix?: unknown };
                    if (prefix !== undefined && (typeof prefix !== "string" || !NAME_PREFIX_PATTERN.test(prefix))) {
                        issues.push(
                            `\`options.naming.${key}.prefix\` must start with a letter or _ and contain only letters, digits and _, got ${JSON.stringify(prefix)}`,
                        );
                    }
                    if (suffix !== undefined && (typeof suffix !== "string" || !NAME_SUFFIX_PATTERN.test(suffix))) {
                        issues.push(
                            `\`options.naming.${key}.suffix\` must contain only letters, digits and _ (empty string drops the default suffix), got ${JSON.stringify(suffix)}`,
                        );
                    }
                }
            }
        }

        if (
            options.validation !== undefined &&
            (typeof options.validation !== "object" || options.validation === null)
        ) {
            issues.push("`options.validation` must be an object like { response?: boolean }");
        }

        if (options.customHeaders !== undefined) {
            if (typeof options.customHeaders !== "object" || options.customHeaders === null) {
                issues.push("`options.customHeaders` must be an object of header name → value strings");
            } else {
                for (const [header, value] of Object.entries(options.customHeaders)) {
                    if (typeof value !== "string") {
                        issues.push(`\`options.customHeaders["${header}"]\` must be a string`);
                    }
                }
            }
        }

        if (options.responseTypeMapping !== undefined) {
            if (typeof options.responseTypeMapping !== "object" || options.responseTypeMapping === null) {
                issues.push("`options.responseTypeMapping` must be an object of content type → response type");
            } else {
                for (const [contentType, value] of Object.entries(options.responseTypeMapping)) {
                    if (!RESPONSE_TYPES.includes(value as (typeof RESPONSE_TYPES)[number])) {
                        issues.push(
                            `\`options.responseTypeMapping["${contentType}"]\` must be one of ${RESPONSE_TYPES.join(", ")}, got ${JSON.stringify(value)}`,
                        );
                    }
                }
            }
        }
    }

    if (c.plugins !== undefined) {
        if (!Array.isArray(c.plugins)) {
            issues.push("`plugins` must be an array of plugin classes (e.g. HttpResourcePlugin, ZodPlugin)");
        } else {
            c.plugins.forEach((plugin, index) => {
                if (typeof plugin !== "function") {
                    issues.push(`\`plugins[${index}]\` must be a plugin class, got ${typeof plugin}`);
                }
            });
        }
    }

    if (c.package !== undefined) {
        if (typeof c.package !== "object" || c.package === null) {
            issues.push(
                "`package` must be an object like { name, version?, repository?, publishRegistry?, angularVersion?, packageJson? }",
            );
        } else {
            validatePackageConfig(c.package as UnknownShape<PackageConfig>, issues);
        }
    }

    if (issues.length > 0) {
        throw new ConfigValidationError(issues);
    }
}

// Approximates npm's rule for new package names (lowercase, URL-safe,
// optionally scoped); the 214-character limit is not checked.
const NPM_PACKAGE_NAME_PATTERN = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
// One simple range whose leading major can be read: "^20.0.0", "~21.1",
// ">=19 <22", "21". No unions ("^20 || ^21") — the leading major also drives
// the toolchain devDependencies, which need one answer.
const ANGULAR_RANGE_PATTERN = /^(\^|~|>=)?\d+(\.\d+){0,2}( <\d+(\.\d+){0,2})?$/;

function validatePackageConfig(pkg: UnknownShape<PackageConfig>, issues: string[]): void {
    if (typeof pkg.name !== "string" || !NPM_PACKAGE_NAME_PATTERN.test(pkg.name)) {
        issues.push(
            `\`package.name\` must be a valid npm package name (lowercase, e.g. "@scope/my-client"), got ${JSON.stringify(pkg.name)}`,
        );
    }
    // Stricter than the spec-derived default (which only warns): an explicit
    // version is a deliberate choice, so a typo here should not reach npm
    if (pkg.version !== undefined && (typeof pkg.version !== "string" || !isSemver(pkg.version))) {
        issues.push(`\`package.version\` must be a semver version like "1.2.3", got ${JSON.stringify(pkg.version)}`);
    }
    if (pkg.repository !== undefined && typeof pkg.repository !== "string") {
        if (typeof pkg.repository !== "object" || pkg.repository === null) {
            issues.push("`package.repository` must be a URL string or an object like { type, url, directory? }");
        } else {
            const { type, url } = pkg.repository as { type?: unknown; url?: unknown };
            if (typeof type !== "string" || typeof url !== "string") {
                issues.push("`package.repository` object form needs string `type` and `url` fields");
            }
        }
    }
    if (pkg.publishRegistry !== undefined && (typeof pkg.publishRegistry !== "string" || !isUrl(pkg.publishRegistry))) {
        issues.push(`\`package.publishRegistry\` must be an http(s) URL, got ${JSON.stringify(pkg.publishRegistry)}`);
    }
    if (pkg.angularVersion !== undefined) {
        if (typeof pkg.angularVersion !== "string" || !ANGULAR_RANGE_PATTERN.test(pkg.angularVersion)) {
            issues.push(
                `\`package.angularVersion\` must be a single semver range starting with the Angular major, like "^20.0.0" or ">=19.0.0 <22", got ${JSON.stringify(pkg.angularVersion)}`,
            );
        } else if ((leadingMajor(pkg.angularVersion) ?? 0) < MIN_ANGULAR_MAJOR) {
            issues.push(
                `\`package.angularVersion\` must target Angular ${MIN_ANGULAR_MAJOR} or later (the generated tsconfig needs TypeScript 5), got ${JSON.stringify(pkg.angularVersion)}`,
            );
        }
    }
    if (pkg.packageJson !== undefined) {
        if (!isPlainObject(pkg.packageJson)) {
            issues.push("`package.packageJson` must be an object of package.json fields to merge in");
        } else {
            validatePackageJsonOverrides(pkg.packageJson, issues);
        }
    }
}

// Fields with a first-class `package` option. An override here would say the
// same thing twice with no rule for which wins — every future first-class
// field joins this list. (`publishConfig.access` and the like stay allowed.)
const PACKAGE_JSON_OWNED_KEYS: ReadonlyArray<[path: readonly string[], option: string]> = [
    [["name"], "package.name"],
    [["version"], "package.version"],
    [["repository"], "package.repository"],
    [["publishConfig", "registry"], "package.publishRegistry"],
];
// Maps npm reads as name → range/command: a non-string value is an invalid
// manifest, and requiring the map shape is what keeps a derived entry from
// being dropped by replacing the whole map with null or an array
const PACKAGE_JSON_STRING_MAPS = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "scripts",
] as const;

function validatePackageJsonOverrides(overrides: Record<string, unknown>, issues: string[]): void {
    for (const [path, option] of PACKAGE_JSON_OWNED_KEYS) {
        const value = path.reduce<unknown>((node, key) => (isPlainObject(node) ? node[key] : undefined), overrides);
        if (value !== undefined) {
            issues.push(`\`package.packageJson.${path.join(".")}\` is not allowed — set \`${option}\` instead`);
        }
    }
    for (const key of PACKAGE_JSON_STRING_MAPS) {
        const map = overrides[key];
        if (map === undefined) {
            continue;
        }
        if (!isPlainObject(map)) {
            issues.push(`\`package.packageJson.${key}\` must be an object of name → string`);
            continue;
        }
        for (const [name, value] of Object.entries(map)) {
            // undefined is skipped by the merge, like everywhere else in the override
            if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
                issues.push(`\`package.packageJson.${key}["${name}"]\` must be a non-empty string`);
            }
        }
    }
    assertJsonValue(overrides, "package.packageJson", issues);
}

/**
 * The override is serialized with JSON.stringify, which silently drops
 * functions and symbols, turns NaN into null, and throws a bare TypeError on
 * bigints and cycles — none of which should reach the emitted file unnoticed.
 * `undefined` is the one non-JSON value accepted: the merge skips it, so
 * `license: process.env["LICENSE"]` with the variable unset adds nothing.
 * A `__proto__` key is refused for the same reason emitObjectKey computes it:
 * assigning it during the merge invokes the setter instead of creating a key.
 */
function assertJsonValue(value: unknown, path: string, issues: string[]): void {
    if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") {
        return;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            issues.push(`\`${path}\` must be a finite number, got ${String(value)}`);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, issues));
        return;
    }
    if (isPlainObject(value)) {
        for (const [key, item] of Object.entries(value)) {
            if (key === "__proto__") {
                issues.push(`\`${path}\` must not contain a "__proto__" key`);
                continue;
            }
            assertJsonValue(item, `${path}.${key}`, issues);
        }
        return;
    }
    issues.push(`\`${path}\` must be a JSON value (string, number, boolean, null, array or plain object)`);
}
