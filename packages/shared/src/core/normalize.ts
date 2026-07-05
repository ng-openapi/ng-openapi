// Concrete-module imports (not barrels) to keep the core <-> types/utils
// import graph cycle-free — see swagger-parser.ts for the same rule.
import { CONTENT_TYPES } from "../utils/content-types.constants";
import { extractPaths } from "../utils/functions/extract-paths";
import { getResponseTypeFromResponse } from "../utils/functions/extract-swagger-response-type";
import type { PathInfo, RequestBody, SwaggerDefinition, SwaggerSpec } from "../types/swagger.types";
import type { NormalizedOperation, ResponseKind } from "../model/operation.model";
import type { NormalizedSpec } from "../model/spec.model";

type ResolveRef = (ref: string) => SwaggerDefinition | undefined;

/**
 * Normalizes a parsed spec into the version-free model the generators consume.
 * Everything here used to be re-derived per generator (service-method body,
 * http-resource body, overloads) — computing it once keeps the derivations
 * identical by construction.
 */
export function normalizeSpec(spec: SwaggerSpec): NormalizedSpec {
    const rawDefinitions = spec.definitions || spec.components?.schemas || {};
    const definitions = Object.fromEntries(
        Object.entries(rawDefinitions).map(([name, definition]) => [name, normalizeSchema(definition)]),
    );
    const resolveReference: ResolveRef = (ref) => {
        const parts = ref.split("/");
        return definitions[parts[parts.length - 1]];
    };

    return {
        version: spec.swagger
            ? { type: "swagger", version: spec.swagger }
            : spec.openapi
              ? { type: "openapi", version: spec.openapi }
              : null,
        definitions,
        operations: extractPaths(spec.paths).map((operation) =>
            normalizeOperation(normalizeOperationSchemas(operation), resolveReference),
        ),
        resolveReference,
    };
}

/**
 * Normalizes the JSON-Schema constructs OpenAPI 3.1 introduced so generators
 * never see them (REFACTORING_PLAN.md phase 6):
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
        normalized.enum = [normalized.const as string | number];
        // A bare `const` carries its type implicitly — make it explicit so
        // schema-typed consumers (zod plugin) don't fall back to `any`.
        const constType = typeof normalized.const;
        if (normalized.type === undefined && (constType === "string" || constType === "number" || constType === "boolean")) {
            normalized.type = constType as typeof schema.type;
        }
        delete normalized.const;
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

function normalizeOperation(operation: PathInfo, resolveRef: ResolveRef): NormalizedOperation {
    const content = operation.requestBody?.content;
    const isMultipart = !!content?.[CONTENT_TYPES.MULTIPART];
    const isUrlEncoded = !!content?.[CONTENT_TYPES.FORM_URLENCODED] && !content?.[CONTENT_TYPES.JSON];

    const formDataSchema = isMultipart
        ? resolveBodySchema(operation.requestBody, CONTENT_TYPES.MULTIPART, resolveRef)
        : undefined;
    const urlEncodedSchema = isUrlEncoded
        ? resolveBodySchema(operation.requestBody, CONTENT_TYPES.FORM_URLENCODED, resolveRef)
        : undefined;

    return {
        ...operation,
        pathParams: operation.parameters?.filter((p) => p.in === "path") || [],
        queryParams: operation.parameters?.filter((p) => p.in === "query") || [],
        hasBody: !!operation.requestBody,
        isMultipart,
        isUrlEncoded,
        formDataSchema,
        formDataFields: Object.keys(formDataSchema?.properties || {}),
        urlEncodedSchema,
        urlEncodedFields: Object.keys(urlEncodedSchema?.properties || {}),
        responseType: determineResponseType(operation),
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

function determineResponseType(operation: PathInfo): ResponseKind {
    const successResponses = ["200", "201", "202", "204", "206"];

    for (const statusCode of successResponses) {
        const response = operation.responses?.[statusCode];
        if (!response) continue;

        return getResponseTypeFromResponse(response);
    }

    return "json";
}
