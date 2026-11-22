import {
    ArgumentNames,
    emitHeaders,
    emitMultipartFormData,
    emitQueryParams,
    emitResponseTypeOption,
    emitUrlConstruction,
    emitUrlEncodedFormBody,
    joinRequestOptionEntries,
    quoteLiteral,
    MethodGenOptions,
    NormalizedOperation,
    QueryStringEmit,
    resolveArgumentNames,
    SERVICE_ARGUMENT_PROFILE,
} from "@ng-openapi/shared";

/**
 * Methods that spell out `body: null` when the operation declares no body.
 * It is what HttpClient sends for an absent body anyway; these three have
 * always emitted it, and dropping it would churn every generated client.
 */
const METHODS_WITH_EXPLICIT_EMPTY_BODY = ["post", "put", "patch"];

/**
 * The locals a form body is built in. Both are reserved in
 * SERVICE_ARGUMENT_PROFILE, so no argument can be named either.
 */
const FORM_DATA_LOCAL = "formData";
const FORM_BODY_LOCAL = "formBody";

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
            emitUrlConstruction(
                operation.path,
                operation.pathParams,
                argumentNames,
                this.queryString(operation, argumentNames),
            ),
            emitQueryParams(operation.queryParams, argumentNames),
            emitHeaders({
                optionsExpression: "options",
                customHeaders: this.config.options.customHeaders,
                accept: (this.config.options.emitAcceptHeader ?? true) ? operation.acceptHeader : undefined,
                contentType: operation,
            }),
            emitMultipartFormData(operation, argumentNames, { container: FORM_DATA_LOCAL }),
            emitUrlEncodedFormBody(operation, argumentNames, { container: FORM_BODY_LOCAL }),
            this.generateHttpRequest(operation, argumentNames),
        ];

        return bodyParts.filter(Boolean).join("\n");
    }

    /** The argument sent as the whole query string, for an operation that has one. */
    private queryString(operation: NormalizedOperation, argumentNames: ArgumentNames): QueryStringEmit | undefined {
        if (!operation.queryString || !argumentNames.queryString) {
            return undefined;
        }
        const { kind, required } = operation.queryString;
        return { value: argumentNames.queryString, kind, required };
    }

    private generateHttpRequest(operation: NormalizedOperation, argumentNames: ArgumentNames): string {
        // Lower-cased as it has always been emitted; HttpRequest upper-cases it
        // again. Quoted below because it can be spec text: a method declared
        // under `additionalOperations` is any HTTP token, `'` included.
        const httpMethod = operation.method.toLowerCase();

        const bodyParam = this.bodyExpression(operation, argumentNames);

        const parseResponse = this.config.options.validation?.response
            ? `.pipe(map(response => options?.parse?.(response) ?? response))`
            : "";

        // The options object is inlined into the request() call so that the
        // literals stay contextually typed — `request` is the only HttpClient
        // method whose overloads accept a union `observe` / `responseType`,
        // which is what lets the generated code stay cast-free.
        const entries: string[] = [];
        if (bodyParam) {
            // Whatever the method: a body the signature takes is a body the
            // request carries (#138). The normalizer keeps the bodies no
            // browser sends — GET, HEAD — out of the IR.
            entries.push(`body: ${bodyParam}`);
        } else if (METHODS_WITH_EXPLICIT_EMPTY_BODY.includes(httpMethod)) {
            entries.push("body: null");
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
return this.httpClient.request(${quoteLiteral(httpMethod)}, url, {
  ${joinRequestOptionEntries(entries)}
})${parseResponse};`;
    }

    /**
     * The expression sent as the body, or "" when the request carries none.
     * `bodyKind` is unset for a field-less form, whose local the form
     * emitters then never declare: it sends no body rather than an
     * identifier nothing declares. The normalizer warns about such a form.
     */
    private bodyExpression(operation: NormalizedOperation, argumentNames: ArgumentNames): string {
        switch (operation.bodyKind) {
            case "multipart":
                return FORM_DATA_LOCAL;
            case "urlencoded":
                return `${FORM_BODY_LOCAL}.toString()`;
            // One argument, passed through: HttpClient serializes a value
            // as JSON and sends a string or a Blob as it is.
            case "json":
            case "text":
            case "binary":
                return argumentNames.body ?? "requestBody";
            default:
                return "";
        }
    }
}
