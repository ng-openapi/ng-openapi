import {
    camelCase,
    CONTENT_TYPES,
    MethodGenOptions,
    getRequestBodyType,
    isDataTypeInterface,
    NormalizedOperation,
} from "@ng-openapi/shared";

export class ServiceMethodBodyGenerator {
    private config: MethodGenOptions;

    constructor(config: MethodGenOptions) {
        this.config = config;
    }

    generateMethodBody(operation: NormalizedOperation): string {
        const bodyParts = [
            this.generateUrlConstruction(operation),
            this.generateQueryParams(operation),
            this.generateHeaders(operation),
            this.generateMultipartFormData(operation),
            this.generateUrlEncodedFormData(operation),
            this.generateRequestOptions(operation),
            this.generateHttpRequest(operation),
        ];

        return bodyParts.filter(Boolean).join("\n");
    }

    private generateUrlConstruction(operation: NormalizedOperation): string {
        let urlExpression = `\`\${this.basePath}${operation.path}\``;

        if (operation.pathParams.length > 0) {
            operation.pathParams.forEach((param) => {
                urlExpression = urlExpression.replace(`{${param.name}}`, `\${${camelCase(param.name)}}`);
            });
        }

        return `const url = ${urlExpression};`;
    }

    private generateQueryParams(operation: NormalizedOperation): string {
        if (operation.queryParams.length === 0) {
            return "";
        }

        const paramMappings = operation.queryParams
            .map(
                (param) =>
                    `if (${camelCase(param.name)} != null) {
  params = HttpParamsBuilder.addToHttpParams(params, ${camelCase(param.name)}, '${param.name}');
}`,
            )
            .join("\n");

        return `
let params = new HttpParams();
${paramMappings}`;
    }

    private generateHeaders(operation: NormalizedOperation): string {
        const hasCustomHeaders = this.config.options.customHeaders;

        let headerCode = `
let headers: HttpHeaders;
if (options?.headers instanceof HttpHeaders) {
  headers = options.headers;
} else {
  headers = new HttpHeaders(options?.headers);
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

        if (operation.isMultipart) {
            headerCode += `
// Remove Content-Type for multipart (browser will set it with boundary)
headers = headers.delete('Content-Type');`;
        } else if (operation.isUrlEncoded) {
            headerCode += `
// Set Content-Type for URL-encoded form data
if (!headers.has('Content-Type')) {
  headers = headers.set('Content-Type', 'application/x-www-form-urlencoded');
}`;
        } else if (operation.hasBody) {
            headerCode += `
// Set Content-Type for JSON requests if not already set
if (!headers.has('Content-Type')) {
  headers = headers.set('Content-Type', 'application/json');
}`;
        }

        return headerCode;
    }

    private generateMultipartFormData(operation: NormalizedOperation): string {
        if (!operation.isMultipart || operation.formDataFields.length === 0) {
            return "";
        }

        const properties = operation.formDataSchema?.properties || {};

        const formDataAppends = operation.formDataFields
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

    private generateUrlEncodedFormData(operation: NormalizedOperation): string {
        if (!operation.isUrlEncoded || operation.urlEncodedFields.length === 0) {
            return "";
        }

        const properties = operation.urlEncodedSchema?.properties || {};

        const formBodyAppends = operation.urlEncodedFields
            .map((field) => {
                const fieldSchema = properties[field];
                const isArray = fieldSchema?.type === "array";

                if (isArray) {
                    return `if (${field} !== undefined && Array.isArray(${field})) {
                  ${field}.forEach((item) => {
                    if (item !== undefined && item !== null) {
                      formBody.append('${field}', String(item));
                    }
                  });
                }`;
                } else {
                    return `if (${field} !== undefined && ${field} !== null) {
                  formBody.append('${field}', String(${field}));
                }`;
                }
            })
            .join("\n");

        return `
const formBody = new URLSearchParams();
${formBodyAppends}`;
    }

    private generateRequestOptions(operation: NormalizedOperation): string {
        const options: string[] = [];

        options.push("observe: observe as any");

        options.push("headers");

        if (operation.queryParams.length > 0) {
            options.push("params");
        }

        if (operation.responseType !== "json") {
            options.push(`responseType: '${operation.responseType}' as '${operation.responseType}'`);
        }

        options.push("reportProgress: options?.reportProgress");
        options.push("withCredentials: options?.withCredentials");
        options.push("context: this.createContextWithClientId(options?.context)");

        const formattedOptions = options.filter((opt) => opt && !opt.includes("undefined")).join(",\n  ");

        return `
const requestOptions: any = {
  ${formattedOptions}
};`;
    }

    private generateHttpRequest(operation: NormalizedOperation): string {
        const httpMethod = operation.method.toLowerCase();

        let bodyParam = "";
        if (operation.hasBody) {
            if (operation.isMultipart) {
                bodyParam = "formData";
            } else if (operation.isUrlEncoded) {
                bodyParam = "formBody.toString()";
            } else if (operation.requestBody?.content?.[CONTENT_TYPES.JSON]) {
                const bodyType = getRequestBodyType(operation.requestBody, this.config);
                const isInterface = isDataTypeInterface(bodyType);
                bodyParam = isInterface ? camelCase(bodyType) : "requestBody";
            }
        }

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
}
