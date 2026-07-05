import { camelCase, GeneratorConfig, NormalizedOperation } from "@ng-openapi/shared";

export class HttpResourceMethodBodyGenerator {
    private config: GeneratorConfig;

    constructor(config: GeneratorConfig) {
        this.config = config;
    }

    generateMethodBody(operation: NormalizedOperation): string {
        const bodyParts = [this.generateHeaders(), this.generateHttpResource(operation)];

        return bodyParts.filter(Boolean).join("\n");
    }

    private generateUrl(operation: NormalizedOperation): string {
        let urlExpression = `\`\${this.basePath}${operation.path}\``;

        if (operation.pathParams.length > 0) {
            operation.pathParams.forEach((param) => {
                urlExpression = urlExpression.replace(
                    `{${param.name}}`,
                    `\${typeof ${camelCase(param.name)} === 'function' ? ${camelCase(param.name)}() : ${camelCase(param.name)}}`,
                );
            });
        }

        return urlExpression;
    }

    private generateQueryParams(operation: NormalizedOperation): string {
        if (operation.queryParams.length === 0) {
            return "";
        }

        const paramMappings = operation.queryParams
            .map(
                (param) =>
                    `const ${camelCase(param.name)}Value = typeof ${camelCase(param.name)} === 'function' ? ${camelCase(param.name)}() : ${camelCase(param.name)};
                if (${camelCase(param.name)}Value != null) {
                    params = HttpParamsBuilder.addToHttpParams(params, ${camelCase(param.name)}Value, '${param.name}');
                }`,
            )
            .join("\n");

        return `
let params = new HttpParams();
${paramMappings}`;
    }

    private generateHeaders(): string {
        const hasCustomHeaders = this.config.options.customHeaders;

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
            headerCode += `
// Add default headers if not already present
${Object.entries(this.config.options.customHeaders || {})
    .map(
        ([key, value]) =>
            `if (!headers.has('${key}')) {
  headers = headers.set('${key}', '${value}');
}`,
    )
    .join("\n")}`;
        }
        return headerCode;
    }

    private generateRequestOptions(operation: NormalizedOperation): string {
        const options: string[] = [];
        const url = this.generateUrl(operation);

        // Always include observe
        options.push(`url: ${url}`);
        options.push(`method: "GET"`);

        if (operation.queryParams.length > 0) {
            options.push("params");
        }

        options.push("headers");

        // Add response type if not JSON
        if (operation.responseType !== "json") {
            options.push(`responseType: '${operation.responseType}' as '${operation.responseType}'`);
        }

        // Create HttpContext with client identification - call the helper method
        options.push("context: this.createContextWithClientId(requestOptions?.context)");

        const formattedOptions = options.filter((opt) => opt && !opt.includes("undefined")).join(",\n  ");

        return `return {
  ${formattedOptions},
  ...requestOptions
}`;
    }

    private generateHttpResource(operation: NormalizedOperation): string {
        const resourceOptions = this.generateRequestOptions(operation);
        const queryParams = this.generateQueryParams(operation);
        let httpResource = "httpResource";
        switch (operation.responseType) {
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
}
