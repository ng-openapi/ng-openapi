import { Parameter, PathInfo } from "../../types";
import { Path } from "swagger-schema-official";

export function extractPaths(swaggerPaths: { [p: string]: Path } = {}): PathInfo[] {
    const paths: PathInfo[] = [];
    Object.entries(swaggerPaths).forEach(([path, pathItem]: [string, any]) => {
        const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

        methods.forEach((method) => {
            if (pathItem[method]) {
                const operation = pathItem[method];
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

function parseParameters(operationParams: any[], pathParams: any[]): Parameter[] {
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