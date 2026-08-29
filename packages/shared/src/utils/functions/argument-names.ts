import { CONTENT_TYPES } from "../content-types.constants";
import type { NormalizedOperation } from "../../model/operation.model";
import type { MethodGenOptions } from "../../types/config.types";
import { camelCase } from "../string.utils";
import { getRequestBodyType } from "./get-request-body-type";
import { isDataTypeInterface } from "./is-data-type-interface";

/**
 * Words that cannot name a binding. Unlike class members — where `class() {}`
 * is legal, which is why the method-name check only rejects `constructor` —
 * a parameter named `class` is a syntax error. `camelCase` guarantees a valid
 * *identifier*, which is a weaker property than "usable as a parameter name".
 * Includes the strict-mode reserved words, since generated code is a module.
 */
const RESERVED_WORDS = [
    "arguments", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
    "do", "else", "enum", "eval", "export", "extends", "false", "finally", "for", "function", "if", "implements",
    "import", "in", "instanceof", "interface", "let", "new", "null", "package", "private", "protected", "public",
    "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with",
    "yield",
] as const;

/** What a generator binds besides its arguments, and whether it takes a body. */
export interface ArgumentNameProfile {
    /** Identifiers the emitted method already binds. */
    readonly reserved: readonly string[];
    /** Whether the emitted method takes the JSON request body as a parameter. */
    readonly bindsRequestBody: boolean;
}

/**
 * The core service method: `observe`/`options` are its trailing parameters,
 * the rest are locals its body declares (see `emit/url.emit.ts`,
 * `emit/query-params.emit.ts`, `emit/headers.emit.ts` and the form-data blocks
 * of `service-method-body.generator.ts`).
 */
// Frozen: a module singleton whose mutation would be observed by every later
// resolveArgumentNames call. `readonly` is compile-time only.
export const SERVICE_ARGUMENT_PROFILE: ArgumentNameProfile = Object.freeze({
    reserved: Object.freeze(["observe", "options", "url", "params", "headers", "formData", "formBody"]),
    bindsRequestBody: true,
});

/**
 * The httpResource plugin's equivalent. Deliberately a different set, not a
 * copy: its trailing parameters are `resourceOptions`/`requestOptions` and it
 * emits no `url`/`formData`/`formBody` locals. Reserving the core's names here
 * would rename plugin parameters for no reason; reserving only the core's would
 * let a `requestOptions` query parameter capture the plugin's own. It also
 * wraps GETs only and never binds a request body, so reserving a body name
 * would burn an identifier no emitted parameter uses.
 */
export const RESOURCE_ARGUMENT_PROFILE: ArgumentNameProfile = Object.freeze({
    reserved: Object.freeze(["resourceOptions", "requestOptions", "params", "headers"]),
    bindsRequestBody: false,
});

/** Key of the JSON request-body argument, which has no wire name of its own. */
const REQUEST_BODY_KEY = Symbol("requestBody");

type ArgumentKey = string | symbol;

/** A wire name that had to be renamed to stay distinct — surfaced as a warning. */
export interface RenamedArgument {
    /** The wire name, or the type-derived name of the request body. */
    source: string;
    identifier: string;
}

export interface ArgumentNames {
    /** The identifier bound to `wireName`. */
    of(wireName: string): string;
    /** The identifier of the JSON request body, when the operation has one. */
    readonly body?: string;
    /** Every identifier assigned, for emitters that derive locals from them. */
    readonly all: readonly string[];
    readonly renamed: readonly RenamedArgument[];
    /**
     * Wire names declared in more than one location (a path *and* a query
     * `id`). They collapse to a single parameter, so the later declaration's
     * type is discarded and one value is sent to both — worth a warning.
     */
    readonly merged: readonly string[];
}

/**
 * Assigns every argument of one operation a distinct TypeScript identifier.
 *
 * Resolution is per-generator, not per-spec: the set of names already taken is
 * a property of the code being emitted (the core service and the httpResource
 * plugin bind different ones), so this is deliberately NOT precomputed on
 * `NormalizedOperation`. It is a pure function of its inputs, so every call
 * site of one generator gets the same answer without threading it through.
 *
 * Doing it one name at a time — as `camelCase(param.name)` per call site did —
 * cannot see collisions: wire names are free-form, so `filter[name]` and
 * `filter.name` both camelCase to `filterName`, and `options[]` lands on the
 * method's own `options` parameter. Order is significant and must stay stable;
 * it decides which argument keeps the unsuffixed name.
 */
export function resolveArgumentNames(
    operation: NormalizedOperation,
    config: MethodGenOptions,
    profile: ArgumentNameProfile,
): ArgumentNames {
    const entries: { key: ArgumentKey; base: string }[] = [
        ...operation.pathParams.map((param) => ({ key: param.name, base: camelCase(param.name) })),
        ...operation.formDataFields.map((field) => ({ key: field, base: camelCase(field) })),
        ...operation.urlEncodedFields.map((field) => ({ key: field, base: camelCase(field) })),
    ];

    const bodyBase = profile.bindsRequestBody ? jsonBodyIdentifier(operation, config) : undefined;
    if (bodyBase !== undefined) {
        entries.push({ key: REQUEST_BODY_KEY, base: bodyBase });
    }

    entries.push(...operation.queryParams.map((param) => ({ key: param.name, base: camelCase(param.name) })));

    // A Map, not an object literal: wire names are untrusted spec text, and an
    // object literal would resolve "constructor" or "toString" to a value off
    // Object.prototype — dropping the argument and emitting a function into the
    // generated source.
    const identifiers = new Map<ArgumentKey, string>();
    const used = new Set<string>([...profile.reserved, ...RESERVED_WORDS]);
    const renamed: RenamedArgument[] = [];
    const merged = new Set<string>();

    for (const { key, base } of entries) {
        // The same wire name in two locations (a path and a query `id`) is one
        // argument, as the generators' dedupe has always treated it.
        if (identifiers.has(key)) {
            if (typeof key === "string") {
                merged.add(key);
            }
            continue;
        }

        let identifier = base;
        let suffix = 2;
        while (used.has(identifier)) {
            identifier = `${base}${suffix}`;
            suffix++;
        }

        if (identifier !== base) {
            renamed.push({ source: typeof key === "string" ? key : base, identifier });
        }
        used.add(identifier);
        identifiers.set(key, identifier);
    }

    return {
        // The fallback runs the *same* rules the resolver would have, rather
        // than a bare camelCase: an unregistered wire name otherwise came back
        // as `class` or `options`, names the resolver never assigns.
        of: (wireName) => identifiers.get(wireName) ?? fallbackIdentifier(wireName, profile),
        body: identifiers.get(REQUEST_BODY_KEY),
        all: Object.freeze([...identifiers.values()]),
        renamed: Object.freeze(renamed),
        merged: Object.freeze([...merged]),
    };
}

/**
 * Identifier for a wire name the resolver never saw. Only reachable for
 * operations assembled outside the normalizer (tests, plugin fixtures); a
 * resolved map contains every wire name of its operation.
 */
function fallbackIdentifier(wireName: string, profile: ArgumentNameProfile): string {
    const base = camelCase(wireName);
    const taken = new Set<string>([...profile.reserved, ...RESERVED_WORDS]);
    return deriveLocalName(base, [...taken]);
}

/**
 * The identifier the JSON request body is bound to, or undefined when the
 * operation has no JSON body. Kept here rather than at the two call sites so
 * the name that lands in the signature is the one the resolver reserved.
 */
function jsonBodyIdentifier(operation: NormalizedOperation, config: MethodGenOptions): string | undefined {
    if (!operation.requestBody || operation.isMultipart) {
        return undefined;
    }
    if (!operation.requestBody.content?.[CONTENT_TYPES.JSON]) {
        return undefined;
    }

    const bodyType = getRequestBodyType(operation.requestBody, config);
    return isDataTypeInterface(bodyType) ? camelCase(bodyType) : "requestBody";
}

/**
 * Uniquifies a derived local (`fooValue`) against the identifiers already
 * bound, so a `fooValue` parameter and the temp for `foo` cannot collide.
 */
export function deriveLocalName(base: string, taken: readonly string[]): string {
    const used = new Set(taken);
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
        name = `${base}${suffix}`;
        suffix++;
    }
    return name;
}
