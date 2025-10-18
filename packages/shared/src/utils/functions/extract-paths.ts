import { Parameter, PathInfo, RequestBody, SwaggerResponse } from "../../types";
import { Path, Operation, Parameter as SwaggerOfficialParameter, Reference } from "swagger-schema-official";

export function extractPaths(
    swaggerPaths: { [p: string]: Path } = {},
    methods = ["get", "post", "put", "patch", "delete", "options", "head"]
): PathInfo[] {
    const paths: PathInfo[] = [];

    for (const [path, pathItem] of Object.entries(swaggerPaths)) {
        for (const method of methods) {
            const operation = pathItem[method as keyof Path];

            if (operation && typeof operation === 'object' && !Array.isArray(operation)) {
                const op = operation as Operation;

                const parameters = parseParameters(op.parameters || [], pathItem.parameters || []);
                const bodyParam = (op.parameters || []).find(p => 'in' in p && p.in === 'body');

                paths.push({
                    path,
                    method: method.toUpperCase(),
                    operationId: op.operationId,
                    summary: op.summary,
                    description: op.description,
                    tags: op.tags || [],
                    parameters: parameters,
                    requestBody: (op as any).requestBody ?? (bodyParam ? { content: { 'application/json': { schema: (bodyParam as any).schema } } } : undefined) as RequestBody | undefined,
                    responses: op.responses as Record<string, SwaggerResponse> | undefined,
                });
            }
        }
    }

    return paths;
}

function parseParameters(operationParams: (SwaggerOfficialParameter | Reference)[], pathParams: (SwaggerOfficialParameter | Reference)[]): Parameter[] {
    const allParams = [...operationParams, ...pathParams];

    return allParams
        .map((param): Parameter | null => {
            if ('$ref' in param) {
                console.warn(`[Generator] Parameter reference ${param.$ref} is not supported and will be ignored.`);
                return null;
            }

            if (param.in === 'body') {
                return null;
            }

            // The `in` property has different literal types for each parameter type in the union.
            // By casting to `string`, we allow the comparison to `'path'` to be checked without a compile-time error.
            const isPath = (param.in as string) === 'path';

            return {
                name: param.name,
                in: param.in as "query" | "path" | "header" | "cookie",
                required: param.required ?? isPath, // Path params are always required
                schema: (param as Parameter).schema,
                type: (param as Parameter).type,
                format: (param as Parameter).format,
                description: param.description,
            };
        })
        .filter((p): p is Parameter => p !== null);
}
