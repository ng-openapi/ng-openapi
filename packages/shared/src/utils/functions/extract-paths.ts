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
                    operationId: operation.operationId,
                    summary: operation.summary,
                    description: operation.description,
                    tags: operation.tags || [],
                    parameters: parseParameters(operation.parameters || [], pathItem.parameters || []),
                    requestBody: operation.requestBody,
                    responses: operation.responses || {},
                });
            }
        });
    });

    return paths;
}

function parseParameters(operationParams: Parameter[], pathParams: Parameter[]): Parameter[] {
    const allParams = [...pathParams, ...operationParams];
    return allParams.map((param) => ({
        name: param.name,
        in: param.in,
        required: param.required || param.in === "path",
        schema: param.schema,
        type: param.type,
        format: param.format,
        description: param.description,
    }));
}
