// Concrete-module import (not the ../types barrel) to keep the core <-> types
// import graph cycle-free — see swagger-parser.ts for the same rule.
import type { SwaggerSpec } from "../types/swagger.types";

/**
 * Inlines `$ref`s that point at a *nested* location inside a schema (a deep
 * JSON pointer such as `#/components/schemas/PolicyEntry/properties/namespaces`)
 * by replacing the reference node with a copy of the sub-schema it targets.
 *
 * Why this must happen here, once, on the raw spec: every ref-to-name primitive
 * downstream (`getTypeScriptType`, `TypeResolver.resolveReference`,
 * `normalizeSpec`'s `resolveReference`) turns a `$ref` into a bare name taken
 * from its **last** segment — `namespaces` → `Namespaces` — and emits it
 * undefined and unimported (`error TS2304: Cannot find name 'Namespaces'`).
 * Parse time is the only layer upstream of *both* consumer families — the
 * raw-spec readers (`getSpec`/`getDefinitions`) and the normalized IR — so
 * inlining once here fixes every consumer at the same time.
 *
 * Plain top-level refs (`#/components/schemas/Pet`, `#/definitions/Pet`) are
 * left untouched so they keep generating an imported model. Unresolvable or
 * cyclic deep pointers are left in place rather than thrown on — destroying the
 * ref would lose information — but each is reported once through `onWarning`,
 * because the type generated for it will not compile.
 */
export function inlineNestedRefs(spec: SwaggerSpec, onWarning?: (message: string) => void): SwaggerSpec {
    return transform(spec, { root: spec, onWarning, warned: new Set() }, []) as SwaggerSpec;
}

/** Ambient state of one `inlineNestedRefs` run, threaded through the walk. */
interface InlineContext {
    readonly root: SwaggerSpec;
    readonly onWarning?: (message: string) => void;
    /** Refs already reported, so a ref used at N sites warns once, not N times. */
    readonly warned: Set<string>;
}

/**
 * Walks `node`, replacing deep-pointer `$ref`s with a copy of their target.
 *
 * Copy-on-write: a node whose descendants all came back unchanged is returned
 * by reference, so a spec without deep pointers passes through as the very same
 * object graph the parser produced — no full-tree rebuild, nothing to flatten.
 */
function transform(node: unknown, ctx: InlineContext, chain: string[]): unknown {
    if (Array.isArray(node)) {
        let changed = false;
        const items = node.map((item) => {
            const next = transform(item, ctx, chain);
            changed ||= next !== item;
            return next;
        });
        return changed ? items : node;
    }

    if (!isPlainObject(node)) {
        return node;
    }

    const ref = node["$ref"];
    if (typeof ref === "string" && isDeepSchemaPointer(ref)) {
        // A pointer already on the resolution chain is a cycle — leave it be.
        if (chain.includes(ref)) {
            warnOnce(
                ctx,
                ref,
                `Nested $ref "${ref}" is cyclic and cannot be inlined finitely — ` +
                    `restructure the target as a named definition. ` +
                    `The generated type for this schema will not compile.`,
            );
            return node;
        }
        const target = resolvePointer(ctx.root, ref);
        if (target === undefined) {
            warnOnce(
                ctx,
                ref,
                `Could not resolve nested $ref "${ref}" — the generated type for this schema will not compile.`,
            );
            return node;
        }
        // Copy the target, then inline any deep pointers it in turn contains.
        return transform(structuredClone(target), ctx, [...chain, ref]);
    }

    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
        const next = transform(value, ctx, chain);
        changed ||= next !== value;
        result[key] = next;
    }
    return changed ? result : node;
}

function warnOnce(ctx: InlineContext, ref: string, message: string): void {
    if (ctx.warned.has(ref)) {
        return;
    }
    ctx.warned.add(ref);
    ctx.onWarning?.(message);
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

/**
 * Resolves a same-document JSON pointer to the node it addresses. Array
 * segments are indices per RFC 6901 (`.../allOf/0/properties/bar`), so
 * composition keywords are traversable. Lookups are own-property only:
 * `"toString" in {}` is true, and a pointer that "resolved" to an inherited
 * function would blow up `structuredClone` with a raw `DataCloneError`,
 * bypassing the typed-error contract.
 */
function resolvePointer(root: SwaggerSpec, ref: string): unknown {
    const segments = ref
        .slice(2)
        .split("/")
        .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

    let current: unknown = root;
    for (const segment of segments) {
        if (Array.isArray(current)) {
            const index = toArrayIndex(segment);
            if (index === undefined || index >= current.length) {
                return undefined;
            }
            current = current[index];
            continue;
        }
        // hasOwnProperty.call, not Object.hasOwn — the build targets lib es2020.
        if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
            return undefined;
        }
        current = current[segment];
    }
    return current;
}

/**
 * An RFC 6901 array index: `0`, or digits without a leading zero. Anything else
 * — a name, a leading-zero form, the past-the-end `-` — addresses nothing in an
 * array, so the pointer is unresolvable.
 */
function toArrayIndex(segment: string): number | undefined {
    return /^(?:0|[1-9][0-9]*)$/.test(segment) ? Number(segment) : undefined;
}

/**
 * Plain objects only — anything with a class prototype is *not* rebuildable by
 * `transform`. js-yaml's default schema turns unquoted timestamps into `Date`s
 * (`example: 2020-01-01`), and `Object.entries(new Date())` is `[]`, so a loose
 * predicate would silently flatten every such value to `{}`.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
