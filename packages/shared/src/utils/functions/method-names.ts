import { describeOperation, InvalidIdentifierError } from "../../errors";
import type { NormalizedOperation } from "../../model";
import type { MethodGenOptions } from "../../types";
import { camelCase, isValidIdentifier, pascalCase } from "../string.utils";

/**
 * Valid identifiers that still cannot name a generated method.
 *
 * `constructor` declares the class constructor, so ts-morph rejects a method
 * by that name. The rest are members the generated classes bind themselves
 * (`httpClient` in the service; `basePath`, `clientContextToken` and the context helper in
 * both): an
 * operationId of `basePath` emitted a method next to the property of the same
 * name — TS2300 ten times over, reported as success. The same insight
 * ArgumentNameProfile.reserved encodes for parameters, applied to methods.
 * Other reserved words are fine — `class() {}` is a legal member.
 */
export const RESERVED_MEMBER_NAMES: readonly string[] = Object.freeze([
    "constructor",
    "httpClient",
    "basePath",
    "clientContextToken",
    "createContextWithClientId",
]);
// A Set is what the lookups want, but Object.freeze does not stop Set.add, so
// the exported value is the frozen array and the Set stays module-private.
const RESERVED_MEMBER_SET: ReadonlySet<string> = new Set(RESERVED_MEMBER_NAMES);

/**
 * The derived method name that collided with a reserved member and was
 * renamed, or undefined when it did not. For the generators to warn on: a
 * rename is part of the public signature and must not be silent.
 */
export function reservedMemberCollision(
    operation: NormalizedOperation,
    config: MethodGenOptions,
): { from: string; to: string } | undefined {
    if (config.options.customizeMethodName || !operation.operationId) {
        return undefined;
    }
    const natural = camelCase(operation.operationId);
    return RESERVED_MEMBER_SET.has(natural) ? { from: natural, to: `_${natural}` } : undefined;
}

/**
 * Single source of truth for the method name of an operation, shared by the
 * service generator and the httpResource plugin — the two emit different
 * clients over the same operations, and a user switching between them (or
 * running both) must get the same method names.
 */
export function getOperationMethodName(operation: NormalizedOperation, config: MethodGenOptions): string {
    // Takes the whole MethodGenOptions rather than the hook alone so callers can
    // pass the config they already hold, matching the other name helpers.
    const customize = config.options.customizeMethodName;
    if (!customize) {
        return defaultOperationMethodName(operation);
    }

    if (operation.operationId == null) {
        throw new InvalidIdentifierError(
            `customizeMethodName needs an operationId, and ${describeOperation(operation)} has none. ` +
                `Add one to the spec, or drop customizeMethodName to use the derived name.`,
            operation,
        );
    }

    const customName = customize(operation.operationId);
    // The hook replaces the built-in conversion outright, so nothing else
    // sanitizes its result — validate rather than silently rewrite it, which
    // would leave the user's config and the generated client disagreeing.
    if (!isValidIdentifier(customName) || RESERVED_MEMBER_SET.has(customName)) {
        throw new InvalidIdentifierError(
            `customizeMethodName returned "${customName}" for ${describeOperation(operation)}, ` +
                `which is not a usable TypeScript method name. Return an identifier — letters, digits, ` +
                `"_" and "$", not starting with a digit — and not one of ${RESERVED_MEMBER_NAMES.map((name) => `"${name}"`).join(", ")}.`,
            operation,
            customName,
        );
    }
    return customName;
}

/**
 * `operationId` when the spec supplies one, otherwise a name built from the
 * path and HTTP method (`GET /pets/{id}` → `petsIdGet`).
 */
function defaultOperationMethodName(operation: NormalizedOperation): string {
    if (operation.operationId) {
        const name = camelCase(operation.operationId);
        // Derived names are sanitized rather than rejected: the spec is valid,
        // so generation must succeed without the user editing it.
        return RESERVED_MEMBER_SET.has(name) ? `_${name}` : name;
    }

    const method = pascalCase(operation.method.toLowerCase());
    // pascalCase drops the `{}` of path templates on its own
    // Empty segments are dropped before conversion: pascalCase never returns
    // "" (an empty identifier is never right), so a root path would otherwise
    // become "__" and the `resource` fallback below would never fire.
    const pathParts = operation.path
        .split("/")
        .filter((segment) => segment !== "")
        .map((segment) => pascalCase(segment));
    const resource = pathParts.join("") || "resource";

    return `${camelCase(resource)}${method}`;
}
