import {
    camelCase,
    GeneratorConfig,
    getRequestBodyType,
    getResponseTypeFromResponse,
    isDataTypeInterface,
    MethodGenerationContext,
    PathInfo,
    SwaggerParser,
} from "@ng-openapi/shared";

export class ServiceMethodBodyGenerator {
    private config: GeneratorConfig;
    private parser: SwaggerParser;

    constructor(config: GeneratorConfig, parser: SwaggerParser) {
        this.config = config;
        this.parser = parser;
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

    isMultipartFormData(operation: PathInfo): boolean {
        return !!operation.requestBody?.content?.["multipart/form-data"];
    }

    getFormDataFields(operation: PathInfo): string[] {
        if (!this.isMultipartFormData(operation)) {
            return [];
        }

        const schema = operation.requestBody?.content?.["multipart/form-data"].schema;
        let resolvedSchema = schema;

        if (schema?.$ref) {
            resolvedSchema = this.parser.resolveReference(schema.$ref);
        }

        const properties = resolvedSchema?.properties || {};
        return Object.keys(properties);
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
                    `if (${param.name} != null) {
  params = HttpParamsBuilder.addToHttpParams(params, ${param.name}, '${param.name}');
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

        const schema = operation.requestBody?.content?.["multipart/form-data"].schema;
        let resolvedSchema = schema;

        if (schema?.$ref) {
            resolvedSchema = this.parser.resolveReference(schema.$ref);
        }

        const properties = resolvedSchema?.properties || {};

        const formDataAppends = context.formDataFields
            .map((field) => {
                const fieldSchema = properties[field];
                const isFile = fieldSchema?.type === "string" && fieldSchema?.format === "binary";
                const isArray = fieldSchema?.type === "array";

                if (isArray) {
                    const itemSchema = Array.isArray(fieldSchema.items) ? fieldSchema.items[0] : fieldSchema.items;
                    const isFileArray = itemSchema?.type === "string" && itemSchema?.format === "binary";

                    const valueExpression = isFileArray ? "item" : "String(item)";

                    return `if (${field} !== undefined && Array.isArray(${field})) {
                  ${field}.forEach((item) => {
                    if (item !== undefined && item !== null) {
                      formData.append('${field}', ${valueExpression});
                    }
                  });
                }`;
                } else {
                    const valueExpression = isFile ? field : `String(${field})`;

                    return `if (${field} !== undefined) {
                  formData.append('${field}', ${valueExpression});
                }`;
                }
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
                const bodyType = getRequestBodyType(operation.requestBody, this.config);
                const isInterface = isDataTypeInterface(bodyType);
                bodyParam = isInterface ? camelCase(bodyType) : "requestBody";
            }
        }

        // Methods that require body
        const methodsWithBody = ["post", "put", "patch"];
        const parseResponse = this.config.options.validation?.response
            ? `.pipe(map(response => options?.parse?.(response) ?? response))`
            : "";

        if (methodsWithBody.includes(httpMethod)) {
            return `
return this.httpClient.${httpMethod}(url, ${bodyParam || "null"}, requestOptions)${parseResponse};`;
        } else {
            return `
return this.httpClient.${httpMethod}(url, requestOptions)${parseResponse};`;
        }
    }

    private determineResponseType(operation: PathInfo): "json" | "blob" | "arraybuffer" | "text" {
        const successResponses = ["200", "201", "202", "204", "206"]; // Added 206 for partial content

        for (const statusCode of successResponses) {
            const response = operation.responses?.[statusCode];
            if (!response) continue;

            // Use the new function that checks both content type and schema
            return getResponseTypeFromResponse(response);
        }

        return "json";
    }
}
