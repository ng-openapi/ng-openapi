import { MethodDeclarationOverloadStructure, OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import { GeneratorConfig, PathInfo, SwaggerResponse } from "../../../types";
import { ServiceMethodParamsGenerator } from "./service-method-params.generator";
import { getTypeScriptType } from "../../../utils";

export class ServiceMethodOverloadsGenerator {
    private config: GeneratorConfig;
    private paramsGenerator: ServiceMethodParamsGenerator;

    constructor(config: GeneratorConfig) {
        this.config = config;
        this.paramsGenerator = new ServiceMethodParamsGenerator(config);
    }

    generateMethodOverloads(operation: PathInfo): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const observeTypes: ("body" | "response" | "events")[] = ["body", "response", "events"];
        const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [];

        // Determine the actual response type for this operation
        const responseType = this.determineResponseTypeForOperation(operation);

        observeTypes.forEach((observe) => {
            const overload = this.generateMethodOverload(operation, observe, responseType);
            if (overload) {
                overloads.push(overload);
            }
        });
        return overloads;
    }

    generateMethodOverload(
        operation: PathInfo,
        observe: "body" | "response" | "events",
        responseType: "json" | "blob" | "arraybuffer" | "text"
    ): OptionalKind<MethodDeclarationOverloadStructure> {
        const responseDataType = this.generateOverloadResponseType(operation);
        const params = this.generateOverloadParameters(operation, observe, responseType);
        const returnType = this.generateOverloadReturnType(responseDataType, observe);
        return {
            parameters: params,
            returnType: returnType,
        };
    }

    generateOverloadParameters(
        operation: PathInfo,
        observe: "body" | "response" | "events",
        responseType: "json" | "arraybuffer" | "blob" | "text"
    ): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.paramsGenerator.generateApiParameters(operation);
        const optionsParam = this.addOverloadOptionsParameter(observe, responseType);

        // Combine all parameters
        const combined = [...params, ...optionsParam];

        const seen = new Set<string>();
        const uniqueParams: OptionalKind<ParameterDeclarationStructure>[] = [];

        for (const param of combined) {
            if (!seen.has(param.name)) {
                seen.add(param.name);
                uniqueParams.push(param);
            }
        }

        return uniqueParams;
    }

    addOverloadOptionsParameter(
        observe: "body" | "response" | "events",
        responseType: "json" | "arraybuffer" | "blob" | "text"
    ): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            {
                name: "observe",
                type: `'${observe}'`,
                hasQuestionToken: true,
            },
            {
                name: "options",
                type: `{ headers?: HttpHeaders; reportProgress?: boolean; responseType?: '${responseType}'; withCredentials?: boolean; context?: HttpContext; }`,
                hasQuestionToken: true,
            },
        ];
    }

    generateOverloadResponseType(operation: PathInfo): string {
        const response = operation.responses?.["200"] || operation.responses?.["201"] || operation.responses?.["204"];

        if (!response) {
            return "any";
        }

        return this.getResponseType(response);
    }

    generateOverloadReturnType(responseType: string, observe: "body" | "response" | "events"): string {
        switch (observe) {
            case "body":
                return `Observable<${responseType}>`;
            case "response":
                return `Observable<HttpResponse<${responseType}>>`;
            case "events":
                return `Observable<HttpEvent<${responseType}>>`;
            default:
                throw new Error(`Unsupported observe type: ${observe}`);
        }
    }

    getResponseTypeFromResponse(response: SwaggerResponse): "json" | "blob" | "arraybuffer" | "text" {
        const content = response.content || {};

        if (Object.keys(content).length === 0) {
            return "json"; // default for empty content
        }

        // Collect all possible response types with their priorities
        const responseTypes: Array<{
            type: "json" | "blob" | "arraybuffer" | "text";
            priority: number;
            contentType: string;
            isPrimitive?: boolean;
        }> = [];

        // Check each content type and its schema
        for (const [contentType, mediaType] of Object.entries(content)) {
            const schema = mediaType?.schema;

            // Check custom mappings first (highest priority)
            const mapping = this.config?.options?.responseTypeMapping || {};
            if (mapping[contentType]) {
                responseTypes.push({
                    type: mapping[contentType],
                    priority: 1, // highest priority
                    contentType,
                });
                continue;
            }

            // Check schema format for binary indication
            if (schema?.format === "binary" || schema?.format === "byte") {
                responseTypes.push({
                    type: "blob",
                    priority: 2,
                    contentType,
                });
                continue;
            }

            // Check if schema type indicates binary
            if (schema?.type === "string" && (schema?.format === "binary" || schema?.format === "byte")) {
                responseTypes.push({
                    type: "blob",
                    priority: 2,
                    contentType,
                });
                continue;
            }

            // Check if this is a primitive type in JSON format
            const isPrimitive = this.isPrimitiveType(schema);
            const inferredType = this.inferResponseTypeFromContentType(contentType);

            let priority = 3; // default priority
            let finalType = inferredType;

            // Special handling for JSON content types with primitive schemas
            if (inferredType === "json" && isPrimitive) {
                // For primitive types, prefer text over json for efficiency
                finalType = "text";
                priority = 2; // Higher priority than regular JSON
            } else if (inferredType === "json") {
                // Regular JSON (objects, arrays) get normal priority
                priority = 2;
            }

            responseTypes.push({
                type: finalType,
                priority,
                contentType,
                isPrimitive,
            });
        }

        // Sort by priority (lower number = higher priority) and return the best match
        responseTypes.sort((a, b) => a.priority - b.priority);
        return responseTypes[0]?.type || "json";
    }

    private isPrimitiveType(schema: any): boolean {
        if (!schema) return false;

        // Direct primitive types
        const primitiveTypes = ["string", "number", "integer", "boolean"];
        if (primitiveTypes.includes(schema.type)) {
            return true;
        }

        // Arrays of primitives are still considered complex
        if (schema.type === "array") {
            return false;
        }

        // Objects are complex
        if (schema.type === "object" || schema.properties) {
            return false;
        }

        // References are assumed to be complex types
        if (schema.$ref) {
            return false;
        }

        // allOf, oneOf, anyOf are complex
        if (schema.allOf || schema.oneOf || schema.anyOf) {
            return false;
        }

        return false;
    }

    getResponseType(response: SwaggerResponse): string {
        const responseType = this.getResponseTypeFromResponse(response);

        // Map response types to TypeScript types
        switch (responseType) {
            case "blob":
                return "Blob";
            case "arraybuffer":
                return "ArrayBuffer";
            case "text":
                return "string";
            case "json": {
                // For JSON, check if we have a schema to get specific type
                const content = response.content || {};
                for (const [contentType, mediaType] of Object.entries(content)) {
                    if (this.inferResponseTypeFromContentType(contentType) === "json" && mediaType?.schema) {
                        return getTypeScriptType(mediaType.schema, this.config, mediaType.schema.nullable);
                    }
                }
                return "any";
            }
            default:
                return "any";
        }
    }

    private determineResponseTypeForOperation(operation: PathInfo): "json" | "blob" | "arraybuffer" | "text" {
        const successResponses = ["200", "201", "202", "204", "206"];

        for (const statusCode of successResponses) {
            const response = operation.responses?.[statusCode];
            if (!response) continue;

            return this.getResponseTypeFromResponse(response);
        }

        return "json";
    }

    private inferResponseTypeFromContentType(contentType: string): "json" | "blob" | "arraybuffer" | "text" {
        // Normalize content type (remove parameters like charset)
        const normalizedType = contentType.split(";")[0].trim().toLowerCase();

        // JSON types (highest priority for structured data)
        if (
            normalizedType.includes("json") ||
            normalizedType === "application/ld+json" ||
            normalizedType === "application/hal+json" ||
            normalizedType === "application/vnd.api+json"
        ) {
            return "json";
        }

        // XML can be treated as text for parsing
        if (
            normalizedType.includes("xml") ||
            normalizedType === "application/soap+xml" ||
            normalizedType === "application/atom+xml" ||
            normalizedType === "application/rss+xml"
        ) {
            return "text";
        }

        // Text types (but exclude certain binary-like text types)
        if (normalizedType.startsWith("text/")) {
            // These text types are better handled as blobs
            const binaryTextTypes = ["text/rtf", "text/cache-manifest", "text/vcard", "text/calendar"];

            if (binaryTextTypes.includes(normalizedType)) {
                return "blob";
            }

            return "text";
        }

        // Form data should be handled as text for parsing
        if (normalizedType === "application/x-www-form-urlencoded" || normalizedType === "multipart/form-data") {
            return "text";
        }

        // Specific text-like application types
        if (
            normalizedType === "application/javascript" ||
            normalizedType === "application/typescript" ||
            normalizedType === "application/css" ||
            normalizedType === "application/yaml" ||
            normalizedType === "application/x-yaml" ||
            normalizedType === "application/toml"
        ) {
            return "text";
        }

        // Binary types that should use arraybuffer for better performance
        if (
            normalizedType.startsWith("image/") ||
            normalizedType.startsWith("audio/") ||
            normalizedType.startsWith("video/") ||
            normalizedType === "application/pdf" ||
            normalizedType === "application/zip" ||
            normalizedType.includes("octet-stream")
        ) {
            return "arraybuffer";
        }

        // Everything else is likely binary and should be blob
        return "blob";
    }
}
