import {
    camelCase,
    CONTENT_TYPES,
    emitHeaders,
    emitQueryParams,
    emitResponseTypeOption,
    emitUrlConstruction,
    getRequestBodyType,
    isDataTypeInterface,
    joinRequestOptionEntries,
    MethodGenOptions,
    NormalizedOperation,
} from "@ng-openapi/shared";

export class ServiceMethodBodyGenerator {
    private config: MethodGenOptions;

    constructor(config: MethodGenOptions) {
        this.config = config;
    }

    generateMethodBody(operation: NormalizedOperation): string {
        const bodyParts = [
            emitUrlConstruction(operation.path, operation.pathParams),
            emitQueryParams(operation.queryParams),
            emitHeaders({
                optionsExpression: "options",
                customHeaders: this.config.options.customHeaders,
                contentType: operation,
            }),
            this.generateMultipartFormData(operation),
            this.generateUrlEncodedFormData(operation),
            this.generateHttpRequest(operation),
        ];

        return bodyParts.filter(Boolean).join("\n");
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

        // The options object is inlined into the request() call so that the
        // literals stay contextually typed — `request` is the only HttpClient
        // method whose overloads accept a union `observe` / `responseType`,
        // which is what lets the generated code stay cast-free.
        const entries: string[] = [];
        if (methodsWithBody.includes(httpMethod)) {
            entries.push(`body: ${bodyParam || "null"}`);
        }
        entries.push("observe");
        entries.push("headers");
        if (operation.queryParams.length > 0) {
            entries.push("params");
        }
        entries.push(emitResponseTypeOption(operation.responseType));
        entries.push("reportProgress: options?.reportProgress");
        entries.push("withCredentials: options?.withCredentials");
        entries.push("context: this.createContextWithClientId(options?.context)");

        return `
return this.httpClient.request('${httpMethod}', url, {
  ${joinRequestOptionEntries(entries)}
})${parseResponse};`;
    }
}
