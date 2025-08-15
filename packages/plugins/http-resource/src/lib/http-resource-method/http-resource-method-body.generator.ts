import { GeneratorConfig, GetMethodGenerationContext, getResponseTypeFromResponse, PathInfo } from "@ng-openapi/shared";

export class HttpResourceMethodBodyGenerator {
    private config: GeneratorConfig;

    constructor(config: GeneratorConfig) {
        this.config = config;
    }

    generateMethodBody(operation: PathInfo): string {
        const context = this.createGenerationContext(operation);

        const bodyParts = [this.generateHeaders(context), this.generateHttpResource(operation, context)];

        return bodyParts.filter(Boolean).join("\n");
    }

    private createGenerationContext(operation: PathInfo): GetMethodGenerationContext {
        return {
            pathParams: operation.parameters?.filter((p) => p.in === "path") || [],
            queryParams: operation.parameters?.filter((p) => p.in === "query") || [],
            responseType: this.determineResponseType(operation),
        };
    }

    private generateUrl(operation: PathInfo, context: GetMethodGenerationContext): string {
        let urlExpression = `\`\${this.basePath}${operation.path}\``;

        if (context.pathParams.length > 0) {
            context.pathParams.forEach((param) => {
                urlExpression = urlExpression.replace(
                    `{${param.name}}`,
                    `\${typeof ${param.name} === 'function' ? ${param.name}() : ${param.name}}`
                );
            });
        }

        return urlExpression;
    }

    private generateQueryParams(context: GetMethodGenerationContext): string {
        if (context.queryParams.length === 0) {
            return "";
        }

        const paramMappings = context.queryParams
            .map(
                (param) =>
                    `const ${param.name}Value = typeof ${param.name} === 'function' ? ${param.name}() : ${param.name};
                    if (${param.name}Value !== undefined) {
  params = params.set('${param.name}', String(${param.name}Value));
}`
            )
            .join("\n");

        return `
let params = new HttpParams();
${paramMappings}`;
    }

    private generateHeaders(context: GetMethodGenerationContext): string {
        const hasCustomHeaders = this.config.options.customHeaders;

        // Always generate headers if we have custom headers or if it's multipart
        if (!hasCustomHeaders) {
            return "";
        }

        // Use the approach that handles both HttpHeaders and plain objects
        // TODO: as Record<string, string> is temporary
        let headerCode = `
let headers: HttpHeaders;
if (requestOptions?.headers instanceof HttpHeaders) {
  headers = requestOptions.headers;
} else {
  headers = new HttpHeaders(requestOptions?.headers as Record<string, string>);
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
        return headerCode;
    }

    private generateRequestOptions(operation: PathInfo, context: GetMethodGenerationContext): string {
        const options: string[] = [];
        const url = this.generateUrl(operation, context);

        // Always include observe
        options.push(`url: ${url}`);
        options.push(`method: "GET"`);

        if (context.queryParams.length > 0) {
            options.push("params");
        }

        // Add headers if we generated them
        const hasHeaders = this.config.options.customHeaders;
        if (hasHeaders) {
            options.push("headers");
        }

        // Add response type if not JSON
        if (context.responseType !== "json") {
            options.push(`responseType: '${context.responseType}' as '${context.responseType}'`);
        }

        // Create HttpContext with client identification - call the helper method
        options.push("context: this.createContextWithClientId(requestOptions?.context)");

        const formattedOptions = options.filter((opt) => opt && !opt.includes("undefined")).join(",\n  ");

        return `return {
  ${formattedOptions},
  ...requestOptions
}`;
    }

    private generateHttpResource(operation: PathInfo, context: GetMethodGenerationContext): string {
        const resourceOptions = this.generateRequestOptions(operation, context);
        const queryParams = this.generateQueryParams(context);
        let httpResource = "httpResource";
        switch (context.responseType) {
            case "blob":
                httpResource += ".blob";
                break;
            case "arraybuffer":
                httpResource += ".arrayBuffer";
                break;
            case "text":
                httpResource += ".text";
                break;
        }
        return `    return ${httpResource}(() => {${queryParams}
       ${resourceOptions}
    }, resourceOptions);`;
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
