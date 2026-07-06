import { GeneratorConfig } from "@ng-openapi/shared";

const RESPONSE_TYPES = ["json", "blob", "arraybuffer", "text"] as const;

/**
 * Thrown when the user-supplied config is structurally invalid. Collects every
 * issue instead of failing on the first one, so a config file can be fixed in
 * one pass.
 */
export class ConfigValidationError extends Error {
    readonly issues: string[];

    constructor(issues: string[]) {
        super(`Invalid ng-openapi configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
        this.name = "ConfigValidationError";
        this.issues = issues;
    }
}

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

        const booleanKeys = ["generateServices", "generateEnumBasedOnDescription", "useSingleRequestParameter"] as const;
        for (const key of booleanKeys) {
            if (options[key] !== undefined && typeof options[key] !== "boolean") {
                issues.push(`\`options.${key}\` must be a boolean`);
            }
        }

        if (options.customizeMethodName !== undefined && typeof options.customizeMethodName !== "function") {
            issues.push("`options.customizeMethodName` must be a function (operationId) => string");
        }

        if (options.validation !== undefined && (typeof options.validation !== "object" || options.validation === null)) {
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

    if (issues.length > 0) {
        throw new ConfigValidationError(issues);
    }
}
