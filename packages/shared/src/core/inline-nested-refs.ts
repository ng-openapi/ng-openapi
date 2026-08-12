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
 * from its **last** segment — `namespaces` → `Namespaces` — and emits that name
 * undefined and unimported. Generated files ship `@ts-nocheck`
 * (`config/constants.ts`), so the consumer's build does not stop on it: the
 * reference degrades to an error-`any` and the API surface is silently wrong.
 * The repo's own compile check strips the pragma and does fail on it
 * (`packages/ng-openapi/tests/nested-ref-compile.test.ts`).
 * Parse time is the only layer upstream of *both* consumer families — the
 * raw-spec readers (`getSpec`/`getDefinitions`) and the normalized IR — so
 * inlining once here fixes every consumer at the same time.
 *
 * Plain top-level refs (`#/components/schemas/Pet`, `#/definitions/Pet`) are
 * left untouched so they keep generating an imported model. A deep pointer that
 * cannot be inlined — unresolvable, cyclic, resolving to a non-schema value,
 * not addressing a schema *position*, or past the expansion limits below — is
 * left in place rather than thrown on (destroying the ref would lose
 * information), but each cause is reported once per ref through `onWarning`:
 * `@ts-nocheck` means a wrong type is not self-announcing, so the warning is
 * the only signal the user gets.
 *
 * Keys sitting next to a deep `$ref` are kept and win over the target's own,
 * per JSON Schema 2020-12, where `$ref` is an ordinary applicator rather than
 * an object replacement. OpenAPI 3.0 says such siblings are ignored, but
 * dropping an author's `description`/`nullable` silently is the worse reading.
 * A sibling that *overrides* a type-bearing key of the target is the one place
 * where that choice changes the emitted TypeScript, so it is warned about by
 * name; overriding an annotation-only key (`description`, `example`) is the
 * ordinary authoring shape and stays silent.
 */
export function inlineNestedRefs(spec: SwaggerSpec, onWarning?: (message: string) => void): SwaggerSpec {
    const ctx: InlineContext = {
        root: spec,
        onWarning,
        warned: new Set(),
        budget: MAX_INLINED_NODES,
        budgetExhausted: false,
    };
    return transform(spec, ctx, []) as SwaggerSpec;
}

/**
 * Bounds on how far one run may expand. The cycle guard only stops a pointer
 * that re-enters *itself*; an acyclic chain of N distinct pointers each used
 * twice by the next still expands 2^N nodes, so it needs a separate ceiling.
 * Without one, a spec — possibly fetched from a remote `input` URL, i.e. not
 * necessarily under the user's control — can drive the generator into minutes
 * of cloning, OOM, or a stack overflow that escapes the typed-error contract.
 *
 * The depth cap bounds recursion (stack), the node budget bounds total output.
 * Both are far above any hand-written spec: deep pointers are rare and their
 * targets are individual property schemas.
 */
const MAX_REF_DEPTH = 64;
const MAX_INLINED_NODES = 100_000;

/** Ambient state of one `inlineNestedRefs` run, threaded through the walk. */
interface InlineContext {
    readonly root: SwaggerSpec;
    readonly onWarning?: (message: string) => void;
    /**
     * Warning keys already reported, so one ref used at N sites warns once, not
     * N times. Keyed by cause *and* ref: the same ref can be both unresolvable
     * at one site and budget-stopped at another.
     */
    readonly warned: Set<string>;
    /** Nodes the run may still materialize by inlining; see MAX_INLINED_NODES. */
    budget: number;
    /**
     * Set once the budget has been overrun. Sticky, so exhaustion is terminal:
     * without it a ref smaller than the remainder still slips through after a
     * bigger one was refused, making which refs survive depend on `Object.
     * entries` order — i.e. on the spec's byte order — and making the warning's
     * "and every deep $ref after it" false.
     */
    budgetExhausted: boolean;
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
                `cyclic:${ref}`,
                `Nested $ref "${ref}" is cyclic and cannot be inlined finitely — ` +
                    `restructure the target as a named definition. ${WRONG_TYPE_SUFFIX}`,
            );
            return node;
        }
        const target = resolvePointer(ctx.root, ref);
        if (target === undefined) {
            warnOnce(ctx, `unresolvable:${ref}`, `Could not resolve nested $ref "${ref}". ${WRONG_TYPE_SUFFIX}`);
            return node;
        }
        // A pointer may address any node in the document, most of which are not
        // schemas: `.../properties/n/type` is the string "array", `.../example`
        // may be null. Inlining those produces a silently wrong type
        // (`Observable<any>`, or a raw TypeError out of TypeResolver on null)
        // instead of a loud failure, so they are refused here. Booleans are
        // legal schemas in OpenAPI 3.1.
        if (!isPlainObject(target) && typeof target !== "boolean") {
            warnOnce(
                ctx,
                `not-a-schema:${ref}`,
                `Nested $ref "${ref}" resolves to ${describeKind(target)}, not a schema — ` +
                    `point it at a schema object. ${WRONG_TYPE_SUFFIX}`,
            );
            return node;
        }
        // The value check above cannot catch a non-schema *plain object*:
        // `.../properties` is a map of schemas, `.../externalDocs`,
        // `.../discriminator/mapping` and an object-valued `.../example` are not
        // schemas either, yet all four are plain objects. Inlined, they yield a
        // schema with no `type` and no `$ref`, which `getTypeScriptType` bottoms
        // out at `any` — silently, where the un-inlined ref at least emitted a
        // dangling type name the repo's compile check catches. So the pointer
        // must also *address* a schema-valued position.
        const nonSchemaSegment = firstNonSchemaSegment(ref);
        if (nonSchemaSegment !== undefined) {
            warnOnce(
                ctx,
                `not-a-schema-position:${ref}`,
                `Nested $ref "${ref}" does not address a schema — its "${nonSchemaSegment}" segment is not a ` +
                    `schema-valued position (expected one of properties/<name>, items, additionalProperties, ` +
                    `allOf|anyOf|oneOf/<index>, not, $defs/<name>). ${WRONG_TYPE_SUFFIX}`,
            );
            return node;
        }
        if (chain.length >= MAX_REF_DEPTH) {
            warnOnce(
                ctx,
                `depth:${ref}`,
                `Nested $ref "${ref}" is more than ${MAX_REF_DEPTH} pointer hops deep and was left uninlined — ` +
                    `restructure the target as a named definition. ${WRONG_TYPE_SUFFIX}`,
            );
            return node;
        }
        // Once the budget has been overrun the run stops inlining altogether —
        // see InlineContext.budgetExhausted. Every ref left behind is named, so
        // no broken ref goes unmentioned under `@ts-nocheck`.
        if (ctx.budgetExhausted) {
            warnOnce(
                ctx,
                `budget:${ref}`,
                `Nested $ref "${ref}" was left uninlined: the ${MAX_INLINED_NODES}-node expansion budget was ` +
                    `already exhausted earlier in this spec. ${WRONG_TYPE_SUFFIX}`,
            );
            return node;
        }
        // Charge the target's size before cloning it. Each nested expansion
        // charges in turn, so the total charged is the total materialized —
        // which is what an acyclic fan-out chain blows up, not the depth.
        const cost = countNodes(target);
        if (cost > ctx.budget) {
            ctx.budgetExhausted = true;
            warnOnce(
                ctx,
                `budget:${ref}`,
                `Inlining nested $refs exceeded the ${MAX_INLINED_NODES}-node expansion budget at "${ref}" — ` +
                    `it and every deep $ref after it were left uninlined. The spec expands combinatorially; ` +
                    `restructure the repeated targets as named definitions. ${WRONG_TYPE_SUFFIX}`,
            );
            return node;
        }
        ctx.budget -= cost;
        // Copy the target, then inline any deep pointers it in turn contains.
        const inlined = transform(structuredClone(target), ctx, [...chain, ref]);
        return mergeSiblings(node, inlined, ref, ctx, chain);
    }

    // Object.fromEntries, not `result[key] = next`: assignment to the key
    // "__proto__" invokes the inherited setter instead of creating an own
    // property, which drops the key and hijacks the rebuilt node's prototype.
    // JSON.parse does produce "__proto__" as a real own key, so a spec can
    // carry one. fromEntries uses CreateDataProperty and keeps it as data.
    let changed = false;
    const entries = Object.entries(node).map(([key, value]) => {
        const next = transform(value, ctx, chain);
        changed ||= next !== value;
        return [key, next] as const;
    });
    return changed ? Object.fromEntries(entries) : node;
}

/**
 * Tail shared by every warning. Deliberately *not* "will not compile": every
 * generated file ships `@ts-nocheck` (`config/constants.ts`), so a dangling type
 * name is suppressed at the consumer's build and shows up as an `any`-shaped
 * API instead of an error. Only the repo's own compile check, which strips the
 * pragma, turns these into build failures.
 */
const WRONG_TYPE_SUFFIX =
    "The generated type will not match the spec (generated files ship @ts-nocheck, " +
    "so this surfaces as a silently wrong type rather than a compile error).";

/**
 * Re-attaches the keys that sat next to the `$ref` on top of the inlined
 * target. `{ $ref: ".../namespaces", description: "…" }` must not lose its
 * description: in JSON Schema 2020-12 `$ref` composes with its siblings, and
 * even under OpenAPI 3.0's "siblings are ignored" reading, dropping them
 * silently is worse than keeping them. Local keys win over the target's.
 */
function mergeSiblings(
    node: Record<string, unknown>,
    inlined: unknown,
    ref: string,
    ctx: InlineContext,
    chain: string[],
): unknown {
    const siblings = Object.entries(node).filter(([key]) => key !== "$ref");
    if (siblings.length === 0) {
        return inlined;
    }
    // A boolean target (3.1) has nowhere to put them.
    if (!isPlainObject(inlined)) {
        warnOnce(
            ctx,
            `sibling-on-boolean:${ref}`,
            `Nested $ref "${ref}" resolves to a boolean schema, so the keys next to it ` +
                `(${siblings.map(([key]) => key).join(", ")}) were dropped.`,
        );
        return inlined;
    }
    // An *additive* sibling (a key the target does not define) is harmless
    // either way, and so is one that only restates the target's own value. What
    // is left — a sibling that *overrides* a key the target defines — is the
    // single case where the 3.0-vs-2020-12 reading changes the emitted
    // TypeScript: `type: "string"` next to a ref at `{ type: "array", items: … }`
    // emits `string` for a `string[]` field, and `Object.fromEntries` resolves
    // it silently by keeping the last entry. Name the keys and say which won.
    const conflicts = siblings
        .filter(
            ([key, value]) =>
                !ANNOTATION_ONLY_KEYS.has(key) &&
                Object.prototype.hasOwnProperty.call(inlined, key) &&
                !sameValue(value, inlined[key]),
        )
        .map(([key]) => key);
    if (conflicts.length > 0) {
        warnOnce(
            ctx,
            `sibling-conflict:${ref}`,
            `Nested $ref "${ref}" sits next to key(s) (${conflicts.join(", ")}) that its target also defines — ` +
                `the local value won and the target's was dropped, per JSON Schema 2020-12, where $ref composes ` +
                `with its siblings; OpenAPI 3.0 would have ignored the local one instead. The generated type ` +
                `follows the sibling, not the target — drop it if the target's value was meant to apply.`,
        );
    }
    return Object.fromEntries([
        ...Object.entries(inlined),
        ...siblings.map(([key, value]) => [key, transform(value, ctx, chain)] as const),
    ]);
}

/**
 * Keys a sibling may override without changing a single character of the
 * emitted TypeScript: nothing downstream reads them for a type. The type-
 * bearing set is what `getTypeScriptType` and `TypeResolver` actually read —
 * `$ref`, `type`, `format`, `enum`/`const`, `items`, `nullable`,
 * `allOf`/`anyOf`/`oneOf`, `additionalProperties`, `properties`, `required`,
 * `readOnly` — and overriding one of those is what the warning is for.
 *
 * Deliberately a deny-list rather than an allow-list of the type-bearing keys:
 * a keyword this repo starts generating from later then warns by default
 * instead of silently going unreported, which is the direction this whole pass
 * exists to protect. Overriding a ref'd property's `description` is the
 * ordinary authoring shape and must not produce noise.
 */
const ANNOTATION_ONLY_KEYS = new Set([
    "description",
    "title",
    "summary",
    "example",
    "examples",
    "externalDocs",
    "deprecated",
    "xml",
    "$comment",
]);

/**
 * Whether a sibling merely restates what the target already says, in which case
 * neither reading of the spec produces a different type and there is nothing to
 * report. Compared against the *inlined* target, so a value this pass rewrote
 * reads as different and warns — the safe direction.
 */
function sameValue(a: unknown, b: unknown): boolean {
    return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function warnOnce(ctx: InlineContext, key: string, message: string): void {
    if (ctx.warned.has(key)) {
        return;
    }
    ctx.warned.add(key);
    ctx.onWarning?.(message);
}

/** How a non-schema pointer target reads in a warning: "null", "an array", "a Date". */
function describeKind(value: unknown): string {
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "an array";
    }
    if (typeof value === "object") {
        // Reached only for class instances — plain objects are schemas. js-yaml
        // hands us `Date`s for unquoted timestamps, so name the class.
        const className: unknown = Object.getPrototypeOf(value)?.constructor?.name;
        return typeof className === "string" ? `a ${className}` : "a non-plain object";
    }
    return `a ${typeof value}`;
}

/**
 * Number of nodes `structuredClone` would materialize for `value` — every
 * object, array and leaf. Counting is O(size) like the clone it precedes, so
 * charging for a subtree never costs more than copying it would have.
 */
function countNodes(value: unknown): number {
    if (Array.isArray(value)) {
        return value.reduce<number>((total, item) => total + countNodes(item), 1);
    }
    if (!isPlainObject(value)) {
        return 1;
    }
    return Object.values(value).reduce<number>((total, item) => total + countNodes(item), 1);
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
 * Where a pointer segment can land, tracked while walking a deep pointer:
 * at a schema, at a map of schemas (`properties`), at an array of them
 * (`allOf`), or at a keyword that is either a schema or an array of schemas
 * (`items` — draft-04/07 allow the tuple form).
 */
type SchemaPosition = "schema" | "schema-map" | "schema-list" | "schema-or-list";

/** Keywords whose value is a single schema. `additionalProperties` may be a boolean, which is one. */
const SCHEMA_KEYWORDS = new Set([
    "not",
    "additionalProperties",
    "unevaluatedItems",
    "unevaluatedProperties",
    "contains",
    "propertyNames",
    "contentSchema",
    "if",
    "then",
    "else",
]);
/** Keywords whose value is a `name -> schema` map. */
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "patternProperties", "dependentSchemas", "$defs", "definitions"]);
/** Keywords whose value is an array of schemas. */
const SCHEMA_LIST_KEYWORDS = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
/** Keywords whose value is a schema, or — pre-2020-12 — an array of them. */
const SCHEMA_OR_LIST_KEYWORDS = new Set(["items", "additionalItems"]);

/**
 * The first segment of a deep pointer that does not address a schema, or
 * `undefined` when the whole pointer does.
 *
 * The value-kind guard in `transform` cannot stand in for this: a `properties`
 * map, an `externalDocs`, a `discriminator/mapping` and an object-valued
 * `example` are all plain objects, so they pass a "looks like a schema" test
 * and inline as a schema with neither `type` nor `$ref` — `any`, silently.
 * Checking the *position* is what distinguishes them, and it is syntactic:
 * every segment past `components/schemas/<Name>` (or `definitions/<Name>`) must
 * be a schema-valued keyword, a name inside a schema map, or an index into a
 * schema array. A pointer ending on a map or a list (`.../properties`,
 * `.../allOf`) fails on its own last segment.
 */
function firstNonSchemaSegment(ref: string): string | undefined {
    const segments = pointerSegments(ref);
    // isDeepSchemaPointer is the gate for this call: `#/definitions/<Name>/…`
    // or `#/components/schemas/<Name>/…`, so the schema root is at 2 or 3.
    const rest = segments.slice(segments[0] === "definitions" ? 2 : 3);

    let position: SchemaPosition = "schema";
    for (const segment of rest) {
        if (position === "schema-map") {
            position = "schema";
            continue;
        }
        if (position === "schema-list") {
            if (toArrayIndex(segment) === undefined) {
                return segment;
            }
            position = "schema";
            continue;
        }
        // In the tuple reading of `items`, an index selects a schema; anything
        // else is read against the single-schema form, i.e. as from a schema.
        if (position === "schema-or-list" && toArrayIndex(segment) !== undefined) {
            position = "schema";
            continue;
        }
        // At a schema: only a schema-valued keyword may follow.
        if (SCHEMA_KEYWORDS.has(segment)) {
            position = "schema";
        } else if (SCHEMA_MAP_KEYWORDS.has(segment)) {
            position = "schema-map";
        } else if (SCHEMA_LIST_KEYWORDS.has(segment)) {
            position = "schema-list";
        } else if (SCHEMA_OR_LIST_KEYWORDS.has(segment)) {
            position = "schema-or-list";
        } else {
            return segment;
        }
    }
    // Ending on a container is ending on a non-schema: name that last segment.
    return position === "schema" || position === "schema-or-list" ? undefined : rest[rest.length - 1];
}

/** Splits a same-document pointer into segments, unescaping `~1`/`~0` per RFC 6901. */
function pointerSegments(ref: string): string[] {
    return ref
        .slice(2)
        .split("/")
        .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/**
 * Resolves a same-document JSON pointer to the node it addresses. Array
 * segments are indices per RFC 6901 (`.../allOf/0/properties/bar`), so
 * composition keywords are traversable. Lookups are own-property only:
 * `"toString" in {}` is true, so a loose check would "resolve" `.../toString`
 * to an inherited function. The caller's schema guard would now refuse that
 * value anyway — this keeps it from being *found* in the first place, so the
 * warning names the real problem (unresolvable) rather than the symptom.
 */
function resolvePointer(root: SwaggerSpec, ref: string): unknown {
    let current: unknown = root;
    const segments = pointerSegments(ref);
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
