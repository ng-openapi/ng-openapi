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
    const definitions = spec.definitions || spec.components?.schemas || {};
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
        operations: extractPaths(spec.paths).map((operation) => normalizeOperation(operation, resolveReference)),
        resolveReference,
    };
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
