import {
    ArgumentNames,
    CONTENT_TYPES,
    emitHeaders,
    emitQueryParams,
    emitResponseTypeOption,
    emitUrlConstruction,
    joinRequestOptionEntries,
    MethodGenOptions,
    NormalizedOperation,
    resolveArgumentNames,
    SERVICE_ARGUMENT_PROFILE,
} from "@ng-openapi/shared";

export class ServiceMethodBodyGenerator {
    private config: MethodGenOptions;

    constructor(config: MethodGenOptions) {
        this.config = config;
    }

    generateMethodBody(operation: NormalizedOperation): string {
        // Resolved here rather than read off the operation: which names are
        // already taken depends on what this generator emits, and the params
        // generator resolves the same pure function to the same answer.
        const argumentNames = resolveArgumentNames(operation, this.config, SERVICE_ARGUMENT_PROFILE);
        const bodyParts = [
            emitUrlConstruction(operation.path, operation.pathParams, argumentNames),
            emitQueryParams(operation.queryParams, argumentNames),
            emitHeaders({
                optionsExpression: "options",
                customHeaders: this.config.options.customHeaders,
                accept: (this.config.options.emitAcceptHeader ?? true) ? operation.acceptHeader : undefined,
                contentType: operation,
            }),
            this.generateMultipartFormData(operation, argumentNames),
            this.generateUrlEncodedFormData(operation, argumentNames),
            this.generateHttpRequest(operation, argumentNames),
        ];

        return bodyParts.filter(Boolean).join("\n");
    }

    private generateMultipartFormData(operation: NormalizedOperation, argumentNames: ArgumentNames): string {
        if (!operation.isMultipart || operation.formDataFields.length === 0) {
            return "";
        }

        const properties = operation.formDataSchema?.properties || {};

        const formDataAppends = operation.formDataFields
            .map((field) => {
                const fieldSchema = properties[field];
                const isFile = fieldSchema?.type === "string" && fieldSchema?.format === "binary";
                const isArray = fieldSchema?.type === "array";
                // `field` is the wire name and stays inside the append literal;
                // only `arg` may appear in expression position (#125).
                const arg = argumentNames.of(field);

                if (isArray) {
                    const itemSchema = Array.isArray(fieldSchema.items) ? fieldSchema.items[0] : fieldSchema.items;
                    const isFileArray = itemSchema?.type === "string" && itemSchema?.format === "binary";

                    const valueExpression = isFileArray ? "item" : "String(item)";

                    return `if (${arg} !== undefined && Array.isArray(${arg})) {
                  ${arg}.forEach((item) => {
                    if (item !== undefined && item !== null) {
                      formData.append('${field}', ${valueExpression});
                    }
                  });
                }`;
                } else {
                    const valueExpression = isFile ? arg : `String(${arg})`;

                    return `if (${arg} !== undefined) {
                  formData.append('${field}', ${valueExpression});
                }`;
                }
            })
            .join("\n");

        return `
const formData = new FormData();
${formDataAppends}`;
    }

    private generateUrlEncodedFormData(operation: NormalizedOperation, argumentNames: ArgumentNames): string {
        if (!operation.isUrlEncoded || operation.urlEncodedFields.length === 0) {
            return "";
        }

        const properties = operation.urlEncodedSchema?.properties || {};

        const formBodyAppends = operation.urlEncodedFields
            .map((field) => {
                const fieldSchema = properties[field];
                const isArray = fieldSchema?.type === "array";
                const arg = argumentNames.of(field);

                if (isArray) {
                    return `if (${arg} !== undefined && Array.isArray(${arg})) {
                  ${arg}.forEach((item) => {
                    if (item !== undefined && item !== null) {
                      formBody.append('${field}', String(item));
                    }
                  });
                }`;
                } else {
                    return `if (${arg} !== undefined && ${arg} !== null) {
                  formBody.append('${field}', String(${arg}));
                }`;
                }
            })
            .join("\n");

        return `
const formBody = new URLSearchParams();
${formBodyAppends}`;
    }

    private generateHttpRequest(operation: NormalizedOperation, argumentNames: ArgumentNames): string {
        const httpMethod = operation.method.toLowerCase();

        let bodyParam = "";
        if (operation.hasBody) {
            if (operation.isMultipart) {
                bodyParam = "formData";
            } else if (operation.isUrlEncoded) {
                bodyParam = "formBody.toString()";
            } else if (operation.requestBody?.content?.[CONTENT_TYPES.JSON]) {
                bodyParam = argumentNames.body ?? "requestBody";
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
