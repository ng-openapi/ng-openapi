import type { Parameter, PathInfo, RequestBody, SwaggerResponse } from "../../types/swagger.types";
import { Path } from "swagger-schema-official";

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

/**
 * Flattens the spec's `paths` object into one PathInfo per (path, method)
 * pair, merging path-level parameters into each operation. Supports both
 * Swagger 2.0 and OpenAPI 3.x path items; methods outside the given list
 * (and vendor extensions) are ignored.
 */
export function extractPaths(
    swaggerPaths: { [p: string]: Path } = {},
    methods = ["get", "post", "put", "patch", "delete", "options", "head"],
): PathInfo[] {
    const paths: PathInfo[] = [];
    Object.entries(swaggerPaths as Record<string, RawPathItem>).forEach(([path, pathItem]) => {
        methods.forEach((method) => {
            const operation = pathItem[method] as RawOperation | undefined;
            if (operation) {
                paths.push({
                    path,
                    method: method.toUpperCase(),
                    operationId: asName(operation.operationId),
                    summary: operation.summary,
                    description: operation.description,
                    tags: Array.isArray(operation.tags) ? operation.tags.flatMap(nameOrNothing) : [],
                    parameters: parseParameters(operation.parameters || [], pathItem.parameters || []),
                    requestBody: operation.requestBody,
                    responses: operation.responses || {},
                });
            }
        });
    });

    return paths;
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

function parseParameters(operationParams: Parameter[], pathParams: Parameter[]): Parameter[] {
    const allParams = [...pathParams, ...operationParams];
    return allParams.map((param) => ({
        name: asName(param.name) ?? "",
        in: param.in,
        required: param.required || param.in === "path",
        schema: param.schema,
        type: param.type,
        format: param.format,
        description: param.description,
    }));
}
