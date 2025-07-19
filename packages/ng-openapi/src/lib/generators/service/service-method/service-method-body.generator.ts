import { GeneratorConfig, MethodGenerationContext, PathInfo, RequestBody, SwaggerResponse } from "../../../types";
import { camelCase, getTypeScriptType } from "../../../utils";

export class ServiceMethodBodyGenerator {
    private config: GeneratorConfig;

    constructor(config: GeneratorConfig) {
        this.config = config;
    }

    generateMethodBody(operation: PathInfo): string {
        const context = this.createGenerationContext(operation);

        const bodyParts = [
            this.generateUrlConstruction(operation, context),
            this.generateQueryParams(context),
            this.generateHeaders(context),
            this.generateMultipartFormData(operation, context),
            this.generateRequestOptions(context),
            this.generateHttpRequest(operation, context),
        ];

        return bodyParts.filter(Boolean).join("\n");
    }

    getRequestBodyType(requestBody: RequestBody): string {
        const content = requestBody.content || {};
        const jsonContent = content["application/json"];

        if (jsonContent?.schema) {
            return getTypeScriptType(jsonContent.schema, this.config, jsonContent.schema.nullable);
        }

        return "any";
    }

    isMultipartFormData(operation: PathInfo): boolean {
        return !!operation.requestBody?.content?.["multipart/form-data"];
    }

    getFormDataFields(operation: PathInfo): string[] {
        if (!this.isMultipartFormData(operation)) {
            return [];
        }

        const properties = operation.requestBody?.content?.["multipart/form-data"]?.schema?.properties || {};
        return Object.keys(properties);
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

    private createGenerationContext(operation: PathInfo): MethodGenerationContext {
        return {
            pathParams: operation.parameters?.filter((p) => p.in === "path") || [],
            queryParams: operation.parameters?.filter((p) => p.in === "query") || [],
            hasBody: !!operation.requestBody,
            isMultipart: this.isMultipartFormData(operation),
            formDataFields: this.getFormDataFields(operation),
            responseType: this.determineResponseType(operation),
        };
    }

    private generateUrlConstruction(operation: PathInfo, context: MethodGenerationContext): string {
        let urlExpression = `\`\${this.basePath}${operation.path}\``;

        if (context.pathParams.length > 0) {
            context.pathParams.forEach((param) => {
                urlExpression = urlExpression.replace(`{${param.name}}`, `\${${param.name}}`);
            });
        }

        return `const url = ${urlExpression};`;
    }

    private generateQueryParams(context: MethodGenerationContext): string {
        if (context.queryParams.length === 0) {
            return "";
        }

        const paramMappings = context.queryParams
            .map(
                (param) =>
                    `if (${param.name} !== undefined) {
  params = params.set('${param.name}', String(${param.name}));
}`
            )
            .join("\n");

        return `
let params = new HttpParams();
${paramMappings}`;
    }

    private generateHeaders(context: MethodGenerationContext): string {
        const hasCustomHeaders = this.config.options.customHeaders;

        // Always generate headers if we have custom headers or if it's multipart
        if (!hasCustomHeaders && !context.isMultipart) {
            return "";
        }

        // Use the approach that handles both HttpHeaders and plain objects
        let headerCode = `
let headers: HttpHeaders;
if (options?.headers instanceof HttpHeaders) {
  headers = options.headers;
} else {
  headers = new HttpHeaders(options?.headers);
}`;

        if (hasCustomHeaders) {
            // Add default headers
            headerCode += `
// Add default headers if not already present
${Object.entries(this.config.options.customHeaders || {})
    .map(
        ([key, value]) =>
            `if (!headers.has('${key}')) {
  headers = headers.set('${key}', '${value}');
}`
    )
    .join("\n")}`;
        }

        // For multipart, ensure Content-Type is not set (browser sets it with boundary)
        if (context.isMultipart) {
            headerCode += `
// Remove Content-Type for multipart (browser will set it with boundary)
headers = headers.delete('Content-Type');`;
        } else if (!context.isMultipart) {
            // For non-multipart requests, set JSON content type if not already set
            headerCode += `
// Set Content-Type for JSON requests if not already set
if (!headers.has('Content-Type')) {
  headers = headers.set('Content-Type', 'application/json');
}`;
        }

        return headerCode;
    }

    private generateMultipartFormData(operation: PathInfo, context: MethodGenerationContext): string {
        if (!context.isMultipart || context.formDataFields.length === 0) {
            return "";
        }

        const formDataAppends = context.formDataFields
            .map((field) => {
                const fieldSchema =
                    operation.requestBody?.content?.["multipart/form-data"]?.schema?.properties?.[field];
                const isFile = fieldSchema?.type === "string" && fieldSchema?.format === "binary";

                const valueExpression = isFile ? field : `String(${field})`;

                return `if (${field} !== undefined) {
  formData.append('${field}', ${valueExpression});
}`;
            })
            .join("\n");

        return `
const formData = new FormData();
${formDataAppends}`;
    }

    private generateRequestOptions(context: MethodGenerationContext): string {
        const options: string[] = [];

        // Always include observe
        options.push("observe: observe as any");

        // Add headers if we generated them
        const hasHeaders = this.config.options.customHeaders || context.isMultipart;
        if (hasHeaders) {
            options.push("headers");
        }

        // Add params if we have query parameters
        if (context.queryParams.length > 0) {
            options.push("params");
        }

        // Add response type if not JSON
        if (context.responseType !== "json") {
            options.push(`responseType: '${context.responseType}' as '${context.responseType}'`);
        }

        // Add other options from the parameter
        options.push("reportProgress: options?.reportProgress");
        options.push("withCredentials: options?.withCredentials");

        // Create HttpContext with client identification - call the helper method
        options.push("context: this.createContextWithClientId(options?.context)");

        const formattedOptions = options.filter((opt) => opt && !opt.includes("undefined")).join(",\n  ");

        return `
const requestOptions: any = {
  ${formattedOptions}
};`;
    }

    private generateHttpRequest(operation: PathInfo, context: MethodGenerationContext): string {
        const httpMethod = operation.method.toLowerCase();

        // Determine if we need body parameter
        let bodyParam = "";
        if (context.hasBody) {
            if (context.isMultipart) {
                bodyParam = "formData";
            } else if (operation.requestBody?.content?.["application/json"]) {
                const bodyType = this.getRequestBodyType(operation.requestBody);
                const isInterface = this.isDataTypeInterface(bodyType);
                bodyParam = isInterface ? camelCase(bodyType) : "requestBody";
            }
        }

        // Methods that require body
        const methodsWithBody = ["post", "put", "patch"];

        if (methodsWithBody.includes(httpMethod)) {
            return `
return this.httpClient.${httpMethod}(url, ${bodyParam || "null"}, requestOptions);`;
        } else {
            return `
return this.httpClient.${httpMethod}(url, requestOptions);`;
        }
    }

    private determineResponseType(operation: PathInfo): "json" | "blob" | "arraybuffer" | "text" {
        const successResponses = ["200", "201", "202", "204", "206"]; // Added 206 for partial content

        for (const statusCode of successResponses) {
            const response = operation.responses?.[statusCode];
            if (!response) continue;

            // Use the new function that checks both content type and schema
            return this.getResponseTypeFromResponse(response);
        }

        return "json";
    }

    private isDataTypeInterface(type: string): boolean {
        const invalidTypes = ["any", "File", "string", "number", "boolean", "object", "unknown", "[]", "Array"];
        return !invalidTypes.some((invalidType) => type.includes(invalidType));
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

    private generateContextHelper(): string {
        return `
/**
 * Creates HttpContext with client identification
 */
private createContextWithClientId(existingContext?: HttpContext): HttpContext {
    const context = existingContext || new HttpContext();
    return context.set(this.clientContextToken, '${this.config.clientName || 'default'}');
}`;
    }
}
