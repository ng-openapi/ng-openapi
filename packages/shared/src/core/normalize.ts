// Concrete-module imports (not barrels) to keep the core <-> types/utils
// import graph cycle-free — see swagger-parser.ts for the same rule.
import { CONTENT_TYPES } from "../utils/content-types.constants";
import { describeOperation } from "../errors";
import { extractPaths } from "../utils/functions/extract-paths";
import type { ResolveParameter } from "../utils/functions/extract-paths";
import { getResponseInfoFromResponse } from "../utils/functions/extract-swagger-response-type";
import type { ResponseTypeInfo } from "../utils/functions/extract-swagger-response-type";
import type { Parameter, PathInfo, RequestBody, SwaggerDefinition, SwaggerSpec } from "../types/swagger.types";
import type { NormalizedOperation } from "../model/operation.model";
import type { NormalizedSpec } from "../model/spec.model";

type ResolveRef = (ref: string) => SwaggerDefinition | undefined;

/**
 * Normalizes a parsed spec into the version-free model the generators consume.
 * Everything here used to be re-derived per generator (service-method body,
 * http-resource body, overloads) — computing it once keeps the derivations
 * identical by construction.
 */
export function normalizeSpec(spec: SwaggerSpec, onWarning?: (message: string) => void): NormalizedSpec {
    const rawDefinitions = spec.definitions || spec.components?.schemas || {};
    const definitions = Object.fromEntries(
        Object.entries(rawDefinitions).map(([name, definition]) => [name, normalizeSchema(definition)]),
    );
    const resolveReference: ResolveRef = (ref) => {
        const parts = ref.split("/");
        return definitions[parts[parts.length - 1]];
    };
    const resolveParameter = createParameterResolver(spec);

    return {
        version: spec.swagger
            ? { type: "swagger", version: spec.swagger }
            : spec.openapi
              ? { type: "openapi", version: spec.openapi }
              : null,
        definitions,
        operations: extractPaths(spec.paths, undefined, onWarning, resolveParameter).map((operation) =>
            normalizeOperation(normalizeOperationSchemas(operation), resolveReference, onWarning),
        ),
        resolveReference,
    };
}

/**
 * Normalizes the JSON-Schema constructs OpenAPI 3.1 introduced so generators
 * never see them:
 *
 * - type arrays: `"null"` members fold into `nullable: true`, and a single
 *   remaining type collapses to a plain string type — so `format`, `enum` and
 *   friends keep working on nullable 3.1 schemas.
 * - `const` becomes a single-value `enum`.
 *
 * Returns a deep copy; the raw spec is never mutated. Schemas without 3.1
 * constructs come back semantically identical.
 */
export function normalizeSchema(schema: SwaggerDefinition): SwaggerDefinition {
    const normalized: SwaggerDefinition = { ...schema };

    // SwaggerDefinition types `type` as a single string; raw 3.1 documents may
    // carry an array — read it untyped and normalize it away right here.
    const rawType: unknown = normalized.type;
    if (Array.isArray(rawType)) {
        const types = rawType.filter((t) => t !== "null");
        if (types.length < rawType.length) {
            normalized.nullable = true;
        }
        // Multi-type arrays (rare) stay arrays for the resolvers' union path
        normalized.type = (types.length === 1 ? types[0] : types.length === 0 ? "null" : types) as typeof schema.type;
    }

    if (normalized.const !== undefined && !normalized.enum) {
        const constType = typeof normalized.const;
        if (constType === "string" || constType === "number") {
            normalized.enum = [normalized.const as string | number];
            // A bare `const` carries its type implicitly — make it explicit so
            // schema-typed consumers (zod plugin) don't fall back to `any`.
            if (normalized.type === undefined) {
                normalized.type = constType as typeof schema.type;
            }
            delete normalized.const;
        } else if (constType === "boolean") {
            // Not folded into enum: a boolean enum member would emit invalid
            // TS for enum-style definitions. Plain boolean is safe everywhere.
            if (normalized.type === undefined) {
                normalized.type = "boolean" as typeof schema.type;
            }
            delete normalized.const;
        }
        // Object/array/null consts are left untouched: folding them into enum
        // would render String(value) garbage like "[object Object]" as a type.
        // Generators ignore the unknown keyword and fall back to their untyped
        // rendering, exactly as before 3.1 support.
    }

    if (normalized.properties) {
        normalized.properties = Object.fromEntries(
            Object.entries(normalized.properties).map(([name, property]) => [name, normalizeSchema(property)]),
        );
    }
    if (normalized.items) {
        normalized.items = Array.isArray(normalized.items)
            ? normalized.items.map(normalizeSchema)
            : normalizeSchema(normalized.items);
    }
    if (typeof normalized.additionalProperties === "object") {
        normalized.additionalProperties = normalizeSchema(normalized.additionalProperties);
    }
    if (normalized.allOf) {
        normalized.allOf = normalized.allOf.map(normalizeSchema);
    }
    if (normalized.oneOf) {
        normalized.oneOf = normalized.oneOf.map(normalizeSchema);
    }
    if (normalized.anyOf) {
        normalized.anyOf = normalized.anyOf.map(normalizeSchema);
    }

    return normalized;
}

/** Applies normalizeSchema to every schema an operation carries (params, body, responses). */
function normalizeOperationSchemas(operation: PathInfo): PathInfo {
    return {
        ...operation,
        parameters: operation.parameters?.map((parameter) =>
            parameter.schema ? { ...parameter, schema: normalizeSchema(parameter.schema) } : parameter,
        ),
        requestBody: operation.requestBody
            ? { ...operation.requestBody, content: normalizeContentSchemas(operation.requestBody.content) }
            : operation.requestBody,
        responses: operation.responses
            ? Object.fromEntries(
                  Object.entries(operation.responses).map(([status, response]) => [
                      status,
                      { ...response, content: normalizeContentSchemas(response.content) },
                  ]),
              )
            : operation.responses,
    };
}

function normalizeContentSchemas(
    content: Record<string, { schema?: SwaggerDefinition }> | undefined,
): Record<string, { schema?: SwaggerDefinition }> | undefined {
    if (!content) return content;
    return Object.fromEntries(
        Object.entries(content).map(([contentType, mediaType]) => [
            contentType,
            mediaType?.schema ? { ...mediaType, schema: normalizeSchema(mediaType.schema) } : mediaType,
        ]),
    );
}

function normalizeOperation(
    operation: PathInfo,
    resolveRef: ResolveRef,
    onWarning?: (message: string) => void,
): NormalizedOperation {
    warnAboutUnboundParameters(operation, onWarning);
    const content = operation.requestBody?.content;
    const isMultipart = !!content?.[CONTENT_TYPES.MULTIPART];
    const isUrlEncoded = !!content?.[CONTENT_TYPES.FORM_URLENCODED] && !content?.[CONTENT_TYPES.JSON];

    const formDataSchema = isMultipart
        ? resolveBodySchema(operation.requestBody, CONTENT_TYPES.MULTIPART, resolveRef)
        : undefined;
    const urlEncodedSchema = isUrlEncoded
        ? resolveBodySchema(operation.requestBody, CONTENT_TYPES.FORM_URLENCODED, resolveRef)
        : undefined;

    const responseInfo = determineResponseInfo(operation);

    const pathParams = operation.parameters?.filter((p) => p.in === "path") || [];
    const queryParams = operation.parameters?.filter((p) => p.in === "query") || [];
    const formDataFields = Object.keys(formDataSchema?.properties || {});
    const urlEncodedFields = Object.keys(urlEncodedSchema?.properties || {});

    return {
        ...operation,
        pathParams,
        queryParams,
        hasBody: !!operation.requestBody,
        isMultipart,
        isUrlEncoded,
        formDataSchema,
        formDataFields,
        urlEncodedSchema,
        urlEncodedFields,
        responseType: responseInfo.responseType,
        acceptHeader: responseInfo.acceptHeader,
    };
}

function resolveBodySchema(
    requestBody: RequestBody | undefined,
    contentType: string,
    resolveRef: ResolveRef,
): SwaggerDefinition | undefined {
    const schema = requestBody?.content?.[contentType]?.schema;
    return schema?.$ref ? resolveRef(schema.$ref) : schema;
}

function determineResponseInfo(operation: PathInfo): ResponseTypeInfo {
    const successResponses = ["200", "201", "202", "204", "206"];

    for (const statusCode of successResponses) {
        const response = operation.responses?.[statusCode];
        if (!response) continue;

        return getResponseInfoFromResponse(response);
    }

    return { responseType: "json" };
}

/**
 * Resolves `$ref` parameters against the document's reusable parameters:
 * `components.parameters` in OpenAPI 3, top-level `parameters` in Swagger 2.0.
 *
 * Matches the whole pointer, not its last segment. `#/components/schemas/Foo`
 * and `common.yaml#/components/parameters/Foo` must not bind a local
 * parameter that happens to be called Foo: that sent a different parameter
 * on the wire with no warning. A component may itself be a Reference
 * Object, so the chain is followed, with a cycle guard — otherwise A → B
 * was reported as a parameter with no name, which it has, one step away.
 */
function createParameterResolver(spec: SwaggerSpec): ResolveParameter {
    // Read untyped: the raw spec types do not model either map fully, and a
    // wrong shape must not throw here.
    const components: Record<string, unknown> =
        (spec.swagger
            ? (spec as { parameters?: Record<string, unknown> }).parameters
            : (spec as { components?: { parameters?: Record<string, unknown> } }).components?.parameters) ?? {};
    const prefix = spec.swagger ? "#/parameters/" : "#/components/parameters/";

    return (ref) => {
        const chain: string[] = [];
        let current = ref;
        for (;;) {
            if (chain.includes(current)) {
                return {
                    problem: `is part of a reference cycle (${[...chain, current].map((r) => `"${r}"`).join(" -> ")})`,
                };
            }
            chain.push(current);
            const hash = current.indexOf("#");
            if (hash > 0) {
                return {
                    problem:
                        `points into another document ("${current.slice(0, hash)}"); references into other documents ` +
                        "are not supported, so bundle the spec into one document first",
                };
            }
            if (!current.startsWith(prefix)) {
                return { problem: `is not a parameter component pointer (expected "${prefix}<name>")` };
            }
            // JSON-pointer unescaping, so a component named "a/b" is reachable.
            const name = current.slice(prefix.length).replace(/~1/g, "/").replace(/~0/g, "~");
            const candidate = Object.prototype.hasOwnProperty.call(components, name) ? components[name] : undefined;
            if (!candidate || typeof candidate !== "object") {
                return { problem: `does not resolve: there is no parameter component named "${name}"` };
            }
            const next = (candidate as { $ref?: unknown }).$ref;
            if (typeof next === "string") {
                current = next;
                continue;
            }
            return { parameter: candidate as Parameter };
        }
    };
}

/**
 * Parameters no generated client binds. Every client — the service
 * generator and the resource plugin alike — takes path and query parameters
 * from `pathParams`/`queryParams` and the body from `requestBody`; anything
 * else on `parameters` is carried for the zod plugin but reaches no
 * signature. Warned here, once per run, so a plugin-only run sees it too:
 * the check used to live in the service generator, and
 * `generateServices: false` with the httpResource plugin lost a required
 * upload with zero warnings.
 *
 * Header and cookie parameters are expressible through the trailing options
 * argument, so only required ones — which the signature then fails to
 * mention — warn; warning about every optional header would bury that
 * case. Swagger 2.0 `formData` and `body` have no such escape hatch and
 * always warn, as does any `in` that is not a location at all.
 */
function warnAboutUnboundParameters(operation: PathInfo, onWarning?: (message: string) => void): void {
    for (const param of operation.parameters ?? []) {
        if (param.in === "path" || param.in === "query") {
            continue;
        }
        if (param.in === "header" || param.in === "cookie") {
            if (param.required) {
                onWarning?.(
                    `Required ${param.in} parameter "${param.name}" of ${describeOperation(operation)} is not bound by the ` +
                        "generated clients — callers must pass it through the trailing options parameter.",
                );
            }
            continue;
        }
        const kind =
            param.in === "formData" || param.in === "body"
                ? `Swagger 2.0 \`in: ${param.in}\``
                : `\`in: ${String(param.in)}\``;
        onWarning?.(
            `${kind} parameter "${param.name}" of ${describeOperation(operation)} is not supported and was dropped` +
                (param.required ? " (it is marked required)" : "") +
                ". Describe it as a requestBody, or as a path or query parameter, to have it generated.",
        );
    }
}
