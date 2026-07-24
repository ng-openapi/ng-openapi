// Concrete-module import (not the ../types barrel) to keep the core <-> types
// import graph cycle-free — see swagger-parser.ts for the same rule.
import type { SwaggerSpec } from "../types/swagger.types";

/**
 * Inlines `$ref`s that point at a *nested* location inside a schema (a deep
 * JSON pointer such as `#/components/schemas/PolicyEntry/properties/namespaces`)
 * by replacing the reference node with a copy of the sub-schema it targets.
 *
 * Why this must happen here, once, on the raw spec: a deep pointer has no
 * top-level model to import, yet every ref-to-name primitive downstream
 * (`getTypeScriptType`, `TypeResolver.resolveReference`, `normalizeSpec`'s
 * `resolveReference`) turns a `$ref` into a bare name from its **last**
 * segment — `namespaces` → `Namespaces` — and emits it undefined and
 * unimported (`error TS2304: Cannot find name 'Namespaces'`). Those primitives
 * only receive `config`, never the definition map, so none of them can walk the
 * pointer. Parse time is the only layer that sees both the reference sites and
 * the definitions, so it is where the pointer is resolved.
 *
 * Plain top-level refs (`#/components/schemas/Pet`, `#/definitions/Pet`) are
 * left untouched so they keep generating an imported model. Unresolvable or
 * cyclic deep pointers are left as-is rather than throwing — best-effort, in
 * line with the rest of the resolver layer.
 */
export function inlineNestedRefs(spec: SwaggerSpec): SwaggerSpec {
    return transform(spec, spec, []) as SwaggerSpec;
}

/** Walks `node`, replacing deep-pointer `$ref`s with a copy of their target. */
function transform(node: unknown, root: SwaggerSpec, chain: string[]): unknown {
    if (Array.isArray(node)) {
        return node.map((item) => transform(item, root, chain));
    }

    if (!isPlainObject(node)) {
        return node;
    }

    const ref = node["$ref"];
    if (typeof ref === "string" && isDeepSchemaPointer(ref)) {
        // A pointer already on the resolution chain is a cycle — leave it be.
        if (chain.includes(ref)) {
            return node;
        }
        const target = resolvePointer(root, ref);
        if (target === undefined) {
            return node;
        }
        // Copy the target, then inline any deep pointers it in turn contains.
        return transform(structuredClone(target), root, [...chain, ref]);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
        result[key] = transform(value, root, chain);
    }
    return result;
}

/**
 * A `$ref` into a schema that is deeper than the definition itself — i.e. it
 * carries path segments beyond `components/schemas/<Name>` (OpenAPI 3.x) or
 * `definitions/<Name>` (Swagger 2.0). Refs at or above that depth, and refs
 * we don't recognize (external files, other component kinds), return false.
 */
function isDeepSchemaPointer(ref: string): boolean {
    if (!ref.startsWith("#/")) {
        return false;
    }
    const segments = ref.slice(2).split("/");
    if (segments[0] === "components" && segments[1] === "schemas") {
        return segments.length > 3;
    }
    if (segments[0] === "definitions") {
        return segments.length > 2;
    }
    return false;
}

/** Resolves a same-document JSON pointer to the node it addresses. */
function resolvePointer(root: SwaggerSpec, ref: string): unknown {
    const segments = ref
        .slice(2)
        .split("/")
        .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

    let current: unknown = root;
    for (const segment of segments) {
        if (!isPlainObject(current) || !(segment in current)) {
            return undefined;
        }
        current = current[segment];
    }
    return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
