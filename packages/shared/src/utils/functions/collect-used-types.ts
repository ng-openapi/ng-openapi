import { PathInfo, RequestBody, SwaggerResponse } from "../../types";
import { pascalCase } from "../index";

export function collectUsedTypes(operations: PathInfo[]): Set<string> {
    const usedTypes = new Set<string>();
    usedTypes.add("RequestOptions");

    operations.forEach((operation) => {
        // Check parameters
        operation.parameters?.forEach((param) => {
            collectTypesFromSchema(param.schema || param, usedTypes);
        });

        // Check request body
        if (operation.requestBody) {
            collectTypesFromRequestBody(operation.requestBody, usedTypes);
        }

        // Check responses
        if (operation.responses) {
            Object.values(operation.responses).forEach((response) => {
                collectTypesFromResponse(response, usedTypes);
            });
        }
    });

    return usedTypes;
}

function collectTypesFromSchema(schema: any, usedTypes: Set<string>): void {
    if (!schema) return;

    if (schema.$ref) {
        const refName = schema.$ref.split("/").pop();
        if (refName) {
            usedTypes.add(pascalCase(refName));
        }
    }

    if (schema.type === "array" && schema.items) {
        collectTypesFromSchema(schema.items, usedTypes);
    }

    if (schema.type === "object" && schema.properties) {
        Object.values(schema.properties).forEach((prop) => {
            collectTypesFromSchema(prop, usedTypes);
        });
    }

    if (schema.allOf) {
        schema.allOf.forEach((subSchema: any) => {
            collectTypesFromSchema(subSchema, usedTypes);
        });
    }

    if (schema.oneOf) {
        schema.oneOf.forEach((subSchema: any) => {
            collectTypesFromSchema(subSchema, usedTypes);
        });
    }

    if (schema.anyOf) {
        schema.anyOf.forEach((subSchema: any) => {
            collectTypesFromSchema(subSchema, usedTypes);
        });
    }
}

function collectTypesFromRequestBody(requestBody: RequestBody, usedTypes: Set<string>): void {
    const content = requestBody.content || {};
    Object.values(content).forEach((mediaType) => {
        if (mediaType.schema) {
            collectTypesFromSchema(mediaType.schema, usedTypes);
        }
    });
}

function collectTypesFromResponse(response: SwaggerResponse, usedTypes: Set<string>): void {
    const content = response.content || {};
    Object.values(content).forEach((mediaType) => {
        if (mediaType.schema) {
            collectTypesFromSchema(mediaType.schema, usedTypes);
        }
    });
}
