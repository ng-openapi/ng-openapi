import { InvalidIdentifierError } from "../../errors";
import type { NormalizedOperation } from "../../model";
import type { MethodGenOptions } from "../../types";
import { camelCase, isValidIdentifier, pascalCase } from "../string.utils";

/**
 * Valid identifiers that still cannot name a generated method: `constructor`
 * declares the class constructor, so ts-morph rejects a method by that name
 * ("Inserting syntax kind of MethodDeclaration, but Constructor was
 * inserted"). Other reserved words are fine — `class() {}` is a legal member.
 */
const RESERVED_MEMBER_NAMES = new Set(["constructor"]);

/**
 * Single source of truth for the method name of an operation, shared by the
 * service generator and the httpResource plugin — the two emit different
 * clients over the same operations, and a user switching between them (or
 * running both) must get the same method names.
 */
export function getOperationMethodName(operation: NormalizedOperation, config: MethodGenOptions): string {
    const customize = config.options.customizeMethodName;
    if (!customize) {
        return defaultOperationMethodName(operation);
    }

    if (operation.operationId == null) {
        throw new Error(
            `Operation ID is required for method name customization of operation: (${operation.method}) ${operation.path}`,
        );
    }

    const customName = customize(operation.operationId);
    // The hook replaces the built-in conversion outright, so nothing else
    // sanitizes its result — validate rather than silently rewrite it, which
    // would leave the user's config and the generated client disagreeing.
    if (!isValidIdentifier(customName) || RESERVED_MEMBER_NAMES.has(customName)) {
        throw new InvalidIdentifierError(
            `customizeMethodName returned "${customName}" for operation "${operation.operationId}" ` +
                `((${operation.method}) ${operation.path}), which is not a usable TypeScript method name. ` +
                `Return an identifier — letters, digits, "_" and "$", not starting with a digit — ` +
                `and not "constructor".`,
            customName,
        );
    }
    return customName;
}

/**
 * `operationId` when the spec supplies one, otherwise a name built from the
 * path and HTTP method (`GET /pets/{id}` → `petsIdGet`).
 */
export function defaultOperationMethodName(operation: NormalizedOperation): string {
    if (operation.operationId) {
        const name = camelCase(operation.operationId);
        // Derived names are sanitized rather than rejected: the spec is valid,
        // so generation must succeed without the user editing it.
        return RESERVED_MEMBER_NAMES.has(name) ? `_${name}` : name;
    }

    const method = pascalCase(operation.method.toLowerCase());
    // pascalCase drops the `{}` of path templates on its own
    const pathParts = operation.path.split("/").map((str) => pascalCase(str));
    const resource = pathParts.join("") || "resource";

    return `${camelCase(resource)}${method}`;
}
