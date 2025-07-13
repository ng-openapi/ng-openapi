import {ClassDeclaration} from "ts-morph";
import {GENERATOR_CONFIG} from "../../config";
import {generateMethodBody, generateMethodOverloads, generateMethodParameters} from "./service-method";
import {GeneratorConfig, PathInfo, RequestBody, SwaggerResponse} from "../../types";
import {camelCase, getTypeScriptType, pascalCase} from "../../utils";

export function addServiceMethod(serviceClass: ClassDeclaration, operation: PathInfo): void {
    const methodName = generateMethodName(operation);
    const parameters = generateMethodParameters(operation);
    const returnType = generateReturnType();
    const methodBody = generateMethodBody(operation, parameters);
    const methodOverLoads = generateMethodOverloads(parameters, operation);

    serviceClass.addMethod({
        name: methodName,
        parameters: parameters,
        returnType: returnType,
        statements: methodBody,
        overloads: methodOverLoads,
    });
}

export function generateMethodName(operation: PathInfo): string {
    if (GENERATOR_CONFIG.options.customizeMethodName){
        if (operation.operationId == null) {
            throw new Error(`Operation ID is required for method name customization of operation: (${operation.method}) ${operation.path}`);
        }
        return GENERATOR_CONFIG.options.customizeMethodName(operation.operationId);
    } else {
        return defaultNameGenerator(operation);
    }
}

export function generateReturnType(): string {
    return 'Observable<any>';
}

export function defaultNameGenerator(operation: PathInfo): string {
    if (operation.operationId) {
        return camelCase(operation.operationId);
    }

    const method = operation.method.toLowerCase();
    const pathParts = operation.path.split('/').filter(p => p && !p.startsWith('{'));
    const resource = pathParts[pathParts.length - 1] || 'resource';

    return `${method}${pascalCase(resource)}`;
}

export function getRequestBodyType(requestBody: RequestBody): string {
    const content = requestBody.content || {};
    const jsonContent = content['application/json'];

    if (jsonContent?.schema) {
        return getTypeScriptType(jsonContent.schema, jsonContent.schema.nullable);
    }

    return 'any';
}

export function isBlobResponse(operation: PathInfo): boolean {
    const successResponses = ['200', '201', '202', '204'];

    for (const statusCode of successResponses) {
        const response = operation.responses?.[statusCode];
        if (!response?.content) {
            continue;
        }

        for (const contentType of Object.keys(response.content)) {
            const responseType = getResponseTypeFromContentType(contentType, GENERATOR_CONFIG);
            if (responseType === 'blob') {
                return true;
            }
        }
    }

    return false;
}

export function getFormDataFields(operation: PathInfo): string[] {
    if (!isMultipartFormData(operation)) {
        return [];
    }

    const properties = operation.requestBody?.content?.["multipart/form-data"]?.schema?.properties || {};
    return Object.keys(properties);
}

export function isMultipartFormData(operation: PathInfo): boolean {
    return !!(operation.requestBody?.content?.["multipart/form-data"]);
}

export function getResponseTypeFromResponse(response: SwaggerResponse, config?: GeneratorConfig): 'json' | 'blob' | 'arraybuffer' | 'text' {
    const content = response.content || {};

    if (Object.keys(content).length === 0) {
        return 'json'; // default for empty content
    }

    // Collect all possible response types with their priorities
    const responseTypes: Array<{ type: 'json' | 'blob' | 'arraybuffer' | 'text', priority: number, contentType: string }> = [];

    // Check each content type and its schema
    for (const [contentType, mediaType] of Object.entries(content)) {
        const schema = mediaType?.schema;

        // Check custom mappings first (highest priority)
        const mapping = config?.options?.responseTypeMapping || {};
        if (mapping[contentType]) {
            responseTypes.push({
                type: mapping[contentType],
                priority: 1, // highest priority
                contentType
            });
            continue;
        }

        // Check schema format for binary indication
        if (schema?.format === 'binary' || schema?.format === 'byte') {
            responseTypes.push({
                type: 'blob',
                priority: 2,
                contentType
            });
            continue;
        }

        // Check if schema type indicates binary
        if (schema?.type === 'string' && (schema?.format === 'binary' || schema?.format === 'byte')) {
            responseTypes.push({
                type: 'blob',
                priority: 2,
                contentType
            });
            continue;
        }

        // Infer from content type with appropriate priority
        const inferredType = inferResponseTypeFromContentType(contentType);
        let priority = 3; // default priority

        // Prioritize JSON over other types
        if (inferredType === 'json') {
            priority = 2;
        }

        responseTypes.push({
            type: inferredType,
            priority,
            contentType
        });
    }

    // Sort by priority (lower number = higher priority) and return the best match
    responseTypes.sort((a, b) => a.priority - b.priority);
    return responseTypes[0]?.type || 'json';
}

export function inferResponseTypeFromContentType(contentType: string): 'json' | 'blob' | 'arraybuffer' | 'text' {
    // Normalize content type (remove parameters like charset)
    const normalizedType = contentType.split(';')[0].trim().toLowerCase();

    // JSON types (highest priority for structured data)
    if (normalizedType.includes('json') ||
        normalizedType === 'application/ld+json' ||
        normalizedType === 'application/hal+json' ||
        normalizedType === 'application/vnd.api+json') {
        return 'json';
    }

    // XML can be treated as text for parsing
    if (normalizedType.includes('xml') ||
        normalizedType === 'application/soap+xml' ||
        normalizedType === 'application/atom+xml' ||
        normalizedType === 'application/rss+xml') {
        return 'text';
    }

    // Text types (but exclude certain binary-like text types)
    if (normalizedType.startsWith('text/')) {
        // These text types are better handled as blobs
        const binaryTextTypes = [
            'text/rtf',
            'text/cache-manifest',
            'text/vcard',
            'text/calendar'
        ];

        if (binaryTextTypes.includes(normalizedType)) {
            return 'blob';
        }

        return 'text';
    }

    // Form data should be handled as text for parsing
    if (normalizedType === 'application/x-www-form-urlencoded' ||
        normalizedType === 'multipart/form-data') {
        return 'text';
    }

    // Specific text-like application types
    if (normalizedType === 'application/javascript' ||
        normalizedType === 'application/typescript' ||
        normalizedType === 'application/css' ||
        normalizedType === 'application/yaml' ||
        normalizedType === 'application/x-yaml' ||
        normalizedType === 'application/toml') {
        return 'text';
    }

    // Binary types that should use arraybuffer for better performance
    if (normalizedType.startsWith('image/') ||
        normalizedType.startsWith('audio/') ||
        normalizedType.startsWith('video/') ||
        normalizedType === 'application/pdf' ||
        normalizedType === 'application/zip' ||
        normalizedType.includes('octet-stream')) {
        return 'arraybuffer';
    }

    // Everything else is likely binary and should be blob
    // This includes:
    // - Most application/* types
    // - font/* types
    // - model/* types
    // - Other multipart/* types
    return 'blob';
}

export function getResponseType(response: SwaggerResponse, config?: GeneratorConfig): string {
    const responseType = getResponseTypeFromResponse(response, config);

    // Map response types to TypeScript types
    switch (responseType) {
        case 'blob':
            return 'Blob';
        case 'arraybuffer':
            return 'ArrayBuffer';
        case 'text':
            return 'string';
        case 'json':
            // For JSON, check if we have a schema to get specific type
            const content = response.content || {};
            for (const [contentType, mediaType] of Object.entries(content)) {
                if (inferResponseTypeFromContentType(contentType) === 'json' && mediaType?.schema) {
                    return getTypeScriptType(mediaType.schema, mediaType.schema.nullable);
                }
            }
            return 'any';
        default:
            return 'any';
    }
}

// Update the old function to use the new logic
export function getResponseTypeFromContentType(contentType: string, config?: GeneratorConfig): 'json' | 'blob' | 'arraybuffer' | 'text' {
    // This function is kept for backward compatibility but now uses the new logic
    const mapping = config?.options?.responseTypeMapping || {};
    if (mapping[contentType]) {
        return mapping[contentType];
    }
    return inferResponseTypeFromContentType(contentType);
}