import type { Parameter, PathInfo, RequestBody, SwaggerResponse } from "../../types/swagger.types";
import { Path } from "swagger-schema-official";
import { describeOperation } from "../../errors";
import type { ComponentResolvers, ResolveComponent } from "./component-resolver";
import { isPlainObject } from "./plain-object";

/**
 * The raw operation shape as it appears in the spec: only the fields
 * extractPaths reads, all optional because the raw spec may omit any of them.
 * RawPathItem below is the loose boundary between untyped spec JSON and the
 * typed PathInfo the generators consume.
 */
interface RawOperation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses?: Record<string, SwaggerResponse>;
}

type RawPathItem = { parameters?: Parameter[] } & { [method: string]: unknown };

/** Outcome of resolving a `$ref` parameter: the component, or why not. */
export type ParameterResolution = { parameter: Parameter } | { problem: string };
/**
 * The parameter-only resolver extractPaths took before it resolved request
 * bodies and responses too. Still accepted in place of ComponentResolvers.
 *
 * @deprecated Pass `{ parameter }` (a ResolveComponent) instead.
 */
export type ResolveParameter = (ref: string) => ParameterResolution;

/**
 * The Path Item fields that hold an operation and are generated. `query` is
 * the OpenAPI 3.2 field for the HTTP QUERY method: a safe, idempotent request
 * that carries its input in a body.
 */
const PATH_ITEM_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "query"];

/**
 * Every method the Path Item Object has a fixed field for. OpenAPI 3.2 forbids
 * repeating one of them under `additionalOperations`; `trace` is on this list
 * and not on the one above because no browser sends it.
 */
const FIXED_FIELD_METHODS: ReadonlySet<string> = new Set([...PATH_ITEM_METHODS, "trace"]);

/**
 * Methods no method is generated for, each with the reason the warning
 * gives. `fetch` and XMLHttpRequest refuse the first three, whatever the
 * server allows, so a generated method could only ever throw.
 *
 * JSONP is different: what happens to it is decided by the app, not by the
 * method. `HttpXhrBackend` throws on it, `withJsonpSupport()` intercepts it
 * and loads a script tag instead (and throws on the headers a generated
 * method sets), and only the fetch backend without JSONP support sends it as
 * the method it is. A generated method cannot know which of those it runs
 * under, so there is none.
 */
const FORBIDDEN_METHODS: ReadonlyMap<string, string> = new Map([
    ...["CONNECT", "TRACE", "TRACK"].map((method): [string, string] => [
        method,
        `browsers refuse to send ${method} requests, so no method is generated for it.`,
    ]),
    [
        "JSONP",
        "Angular's HttpClient treats JSONP specially: its XHR backend refuses it and withJsonpSupport() " +
            "turns it into a script-tag request, so whether it is sent depends on how the app sets up " +
            "HttpClient. No method is generated for it.",
    ],
]);

/** An HTTP method is a `token` (RFC 9110, section 5.6.2). */
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Flattens the spec's `paths` object into one PathInfo per (path, method)
 * pair, merging path-level parameters into each operation. Supports both
 * Swagger 2.0 and OpenAPI 3.x path items: the fixed method fields on the
 * given list, plus the methods OpenAPI 3.2 declares under
 * `additionalOperations` (COPY, PURGE, a custom one). Anything else on a path
 * item, vendor extensions included, is not an operation and is ignored; a
 * method that is declared and cannot be generated is skipped out loud.
 *
 * `methods` chooses among the fixed fields only. The entries of
 * `additionalOperations` are returned whatever it lists: they are not fields
 * of the path item, and a list of field names has no way to name them.
 *
 * A `$ref` parameter, request body or response is replaced by the component
 * its resolver returns; one the resolver cannot resolve is warned about and
 * left out. With no resolver for its kind, a `$ref` request body or response
 * is passed through as written, and a `$ref` parameter is warned about and
 * left out — what extractPaths did before it took resolvers for them.
 * normalizeSpec passes all three, so no consumer of the IR sees a `$ref`.
 */
export function extractPaths(
    swaggerPaths: { [p: string]: Path } = {},
    methods = PATH_ITEM_METHODS,
    onWarning?: (message: string) => void,
    resolvers: ComponentResolvers | ResolveParameter = {},
): PathInfo[] {
    const { parameter, requestBody, response } = typeof resolvers === "function" ? fromLegacy(resolvers) : resolvers;
    const paths: PathInfo[] = [];

    /** `method` is what the IR carries and what is sent: upper-cased. */
    const extract = (path: string, pathItem: RawPathItem, method: string, operation: RawOperation): PathInfo => {
        const operationRef = { path, method, operationId: asName(operation.operationId) };
        const described = describeOperation(operationRef);
        return {
            ...operationRef,
            summary: operation.summary,
            description: operation.description,
            tags: Array.isArray(operation.tags) ? operation.tags.flatMap(nameOrNothing) : [],
            parameters: parseParameters(
                operation.parameters || [],
                pathItem.parameters || [],
                `(${operationRef.method}) ${path}`,
                onWarning,
                parameter ?? (() => ({ problem: "cannot be resolved here: no reusable parameters were provided" })),
            ),
            requestBody:
                operation.requestBody &&
                dereference(
                    operation.requestBody,
                    requestBody,
                    `The request body of ${described}`,
                    "The request body was skipped: generated methods take no body and no validator is generated for it.",
                    onWarning,
                ),
            responses: resolveResponses(operation.responses || {}, described, onWarning, response),
        };
    };

    Object.entries(swaggerPaths as Record<string, RawPathItem>).forEach(([path, pathItem]) => {
        methods.forEach((method) => {
            const operation = pathItem[method] as RawOperation | undefined;
            if (operation) {
                paths.push(extract(path, pathItem, method.toUpperCase(), operation));
            }
        });
        // Not when the caller asked for `trace`: it was extracted just above.
        if (pathItem["trace"] && !methods.includes("trace")) {
            onWarning?.(
                `Operation ${describeOperation({ path, method: "TRACE", operationId: asName((pathItem["trace"] as RawOperation).operationId) })} ` +
                    "was skipped: browsers refuse to send TRACE requests, so no method is generated for it.",
            );
        }
        for (const [method, operation] of additionalOperations(path, pathItem, onWarning)) {
            paths.push(extract(path, pathItem, method, operation));
        }
    });

    return paths;
}

/**
 * The operations a path item declares under OpenAPI 3.2's
 * `additionalOperations`, keyed by the method that is sent.
 *
 * The map key is the method "with the same capitalization that is to be sent",
 * but that is not ours to honor: Angular's `HttpRequest` upper-cases every
 * method name. So the key is upper-cased here, said when that changes it, and
 * two keys that only differ by case are one method. Of those, the one written
 * as it is sent is the operation that was meant for the method, so it is the
 * one kept, wherever it stands; without one, the first is.
 */
function additionalOperations(
    path: string,
    pathItem: RawPathItem,
    onWarning?: (message: string) => void,
): Array<[method: string, operation: RawOperation]> {
    const declared = pathItem["additionalOperations"];
    if (declared === undefined) {
        return [];
    }
    if (!isPlainObject(declared)) {
        onWarning?.(
            `\`additionalOperations\` of path "${path}" is not a map of HTTP methods to operations and was skipped.`,
        );
        return [];
    }

    const subject = (key: string) => `Operation "${key}" under \`additionalOperations\` of path "${path}"`;
    const operations = new Map<string, { key: string; operation: RawOperation }>();
    for (const [key, operation] of Object.entries(declared)) {
        const skipped = (reason: string, skippedKey = key) =>
            onWarning?.(`${subject(skippedKey)} was skipped: ${reason}`);
        if (!HTTP_TOKEN.test(key)) {
            skipped("its key is not a valid HTTP method name.");
            continue;
        }
        const method = key.toUpperCase();
        // Before the fixed-field check, which would send a TRACE to the
        // `trace` field: it is skipped there too, for this reason.
        const forbidden = FORBIDDEN_METHODS.get(method);
        if (forbidden !== undefined) {
            skipped(forbidden);
            continue;
        }
        if (FIXED_FIELD_METHODS.has(method.toLowerCase())) {
            skipped(
                `${method} has its own field on the path item, and OpenAPI does not allow it here. ` +
                    `Declare the operation under \`${method.toLowerCase()}\`.`,
            );
            continue;
        }
        if (!isPlainObject(operation)) {
            skipped("it is not an operation object.");
            continue;
        }
        const sameMethod = `the path also declares a ${method} operation, and method names are sent upper-cased.`;
        const kept = operations.get(method);
        if (kept === undefined) {
            operations.set(method, { key, operation: operation as RawOperation });
        } else if (key === method) {
            // Only one key can be the method as it is sent, so `kept` is not.
            skipped(sameMethod, kept.key);
            operations.set(method, { key, operation: operation as RawOperation });
        } else {
            skipped(sameMethod);
        }
    }
    for (const [method, { key }] of operations) {
        if (key !== method) {
            onWarning?.(`${subject(key)} is sent as ${method}: Angular's HttpClient upper-cases method names.`);
        }
    }
    return [...operations].map(([method, { operation }]) => [method, operation]);
}

/** Adapts the parameter-only resolver of the old signature. */
function fromLegacy(resolveParameter: ResolveParameter): ComponentResolvers {
    return {
        parameter: (ref) => {
            const resolution = resolveParameter(ref);
            return "parameter" in resolution ? { value: resolution.parameter } : resolution;
        },
    };
}

/**
 * The value itself, or — when it is a Reference Object — the component it
 * points to. A ref that does not resolve yields undefined and a warning with
 * the resolver's reason (an external document, a pointer to the wrong kind of
 * component, a missing name, a cycle), so the user is sent to the actual
 * problem, not a generic one. With no resolver, the ref is passed through.
 */
function dereference<T>(
    value: T,
    resolve: ResolveComponent<T> | undefined,
    subject: string,
    skipped: string,
    onWarning?: (message: string) => void,
): T | undefined {
    const ref = (value as { $ref?: unknown } | null | undefined)?.$ref;
    if (typeof ref !== "string" || !resolve) {
        return value;
    }
    const resolution = resolve(ref);
    if ("value" in resolution) {
        return resolution.value;
    }
    onWarning?.(`${subject} references "${ref}", which ${resolution.problem}. ${skipped}`);
    return undefined;
}

function resolveResponses(
    responses: Record<string, SwaggerResponse>,
    operation: string,
    onWarning?: (message: string) => void,
    resolveResponse?: ResolveComponent<SwaggerResponse>,
): Record<string, SwaggerResponse> {
    // fromEntries, not assignment: a "__proto__" status key would hit the
    // prototype setter and vanish.
    return Object.fromEntries(
        Object.entries(responses).flatMap(([status, response]) => {
            const subject = `The "${status}" response of ${operation}`;
            // A success response is where the method's return type and
            // response type come from, so losing one changes the signature,
            // not just the validators.
            const skipped = status.startsWith("2")
                ? "The response was skipped: no validator is generated from it, and the method's return type and " +
                  "response type come from its other success responses — `any`, read as JSON, if none is left."
                : "The response was skipped: no validator is generated from it.";
            // Nothing schema-validates the document: `"200": null` used to
            // reach normalizeSpec and throw a raw TypeError out of the run.
            if (!isPlainObject(response)) {
                onWarning?.(`${subject} is not an object. ${skipped}`);
                return [];
            }
            const resolved = dereference<SwaggerResponse>(response, resolveResponse, subject, skipped, onWarning);
            return resolved === undefined ? [] : [[status, resolved] as const];
        }),
    );
}

/**
 * A spec name, or undefined when the value is not usable as one.
 *
 * This is the boundary between untyped spec JSON and the typed PathInfo, and
 * nothing schema-validates the document: a numeric `operationId`, a `tags`
 * entry that is an object, or a non-string parameter name all reached the
 * generators and threw a raw TypeError out of the run from inside camelCase.
 * Numbers are kept, since a YAML `operationId: 2` is plainly meant as a name.
 */
function asName(value: unknown): string | undefined {
    if (typeof value === "string") {
        return value;
    }
    return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

/** asName as a flatMap step: an unusable entry contributes nothing. */
function nameOrNothing(value: unknown): string[] {
    const name = asName(value);
    return name === undefined ? [] : [name];
}

function parseParameters(
    operationParams: Parameter[],
    pathParams: Parameter[],
    location: string,
    onWarning?: (message: string) => void,
    resolveParameter?: ResolveComponent<Parameter>,
): Parameter[] {
    const allParams = [...pathParams, ...operationParams].flatMap((param): Parameter[] => {
        // A `$ref` parameter has no name of its own — the referenced component
        // does, so it is resolved before the name check below.
        const resolved = dereference(
            param,
            resolveParameter,
            `A parameter of ${location}`,
            "The parameter was skipped.",
            onWarning,
        );
        return resolved === undefined ? [] : [resolved];
    });
    // A parameter without a usable name cannot be bound to anything. A finite
    // number is a name (a YAML `name: 42` plainly means one); an empty string,
    // or anything else that is not a string, is dropped here, out loud,
    // rather than coerced to "" — which traded a loud TypeError for silent
    // invalid TypeScript, since "" reached the signature verbatim.
    const named = allParams.filter((param) => {
        const name = asName(param.name);
        if (name !== undefined && name !== "") {
            return true;
        }
        const where = typeof param.in === "string" ? `${param.in} parameter` : "parameter";
        const shown = param.name === undefined ? "no name" : `name ${JSON.stringify(param.name)}`;
        onWarning?.(`A ${where} of ${location} has ${shown} and was skipped. Give it a name in the spec.`);
        return false;
    });
    return named.map((param) => ({
        name: asName(param.name) as string,
        in: param.in,
        required: param.required || param.in === "path",
        schema: param.schema,
        type: param.type,
        format: param.format,
        description: param.description,
        // Only where it is declared: every other parameter keeps the shape it
        // has always had.
        ...(isPlainObject(param.content) ? { content: param.content } : {}),
    }));
}
