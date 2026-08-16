import { CONTENT_TYPES } from "../content-types.constants";
import type { NormalizedOperation } from "../../model/operation.model";
import type { MethodGenOptions } from "../../types/config.types";
import { camelCase } from "../string.utils";
import { getRequestBodyType } from "./get-request-body-type";
import { isDataTypeInterface } from "./is-data-type-interface";

/**
 * Identifiers the core service method already binds: `observe`/`options` are
 * its trailing parameters, the rest are locals its body declares (see
 * `emit/url.emit.ts`, `emit/query-params.emit.ts`, `emit/headers.emit.ts` and
 * the form-data blocks of `service-method-body.generator.ts`).
 */
export const SERVICE_RESERVED_ARGUMENT_NAMES = [
    "observe",
    "options",
    "url",
    "params",
    "headers",
    "formData",
    "formBody",
] as const;

/**
 * The httpResource plugin's equivalent. Deliberately a different set, not a
 * copy: the plugin's trailing parameters are `resourceOptions`/`requestOptions`
 * and it emits no `url`/`formData`/`formBody` locals. Reserving the core's
 * names here would rename plugin parameters for no reason; reserving only the
 * core's would let a `requestOptions` query parameter capture the plugin's own.
 */
export const RESOURCE_RESERVED_ARGUMENT_NAMES = ["resourceOptions", "requestOptions", "params", "headers"] as const;

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
    reservedNames: readonly string[],
): ArgumentNames {
    const entries: { key: ArgumentKey; base: string }[] = [
        ...operation.pathParams.map((param) => ({ key: param.name, base: camelCase(param.name) })),
        ...operation.formDataFields.map((field) => ({ key: field, base: camelCase(field) })),
        ...operation.urlEncodedFields.map((field) => ({ key: field, base: camelCase(field) })),
    ];

    const bodyBase = jsonBodyIdentifier(operation, config);
    if (bodyBase !== undefined) {
        entries.push({ key: REQUEST_BODY_KEY, base: bodyBase });
    }

    entries.push(...operation.queryParams.map((param) => ({ key: param.name, base: camelCase(param.name) })));

    // A Map, not an object literal: wire names are untrusted spec text, and an
    // object literal would resolve "constructor" or "toString" to a value off
    // Object.prototype — dropping the argument and emitting a function into the
    // generated source.
    const identifiers = new Map<ArgumentKey, string>();
    const used = new Set<string>(reservedNames);
    const renamed: RenamedArgument[] = [];

    for (const { key, base } of entries) {
        // The same wire name in two locations (a path and a query `id`) is one
        // argument, as the generators' dedupe has always treated it.
        if (identifiers.has(key)) {
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
        of: (wireName) => identifiers.get(wireName) ?? camelCase(wireName),
        body: identifiers.get(REQUEST_BODY_KEY),
        all: [...identifiers.values()],
        renamed,
    };
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
