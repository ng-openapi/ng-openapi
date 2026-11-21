import {
    ArgumentNames,
    defaultContentType,
    deriveLocalName,
    emitDefaultHeadersMerge,
    emitMultipartFormData,
    emitSequenceParser,
    emitSignalAwareQueryParams,
    emitUrlEncodedFormBody,
    emitUrlExpression,
    getResponseType,
    joinRequestOptionEntries,
    MethodGenOptions,
    NormalizedOperation,
    QueryStringEmit,
    RESOURCE_ARGUMENT_PROFILE,
    resolveArgumentNames,
    signalAwareParamValue,
} from "@ng-openapi/shared";

/** The request body of one resource: what is declared for it, and what is sent. */
interface ResourceBody {
    /** Statements that build the body inside the request function; "" for a JSON body. */
    setup: string;
    /** The expression of the `body` entry. */
    expression: string;
}

export class HttpResourceMethodBodyGenerator {
    private config: MethodGenOptions;

    constructor(config: MethodGenOptions) {
        this.config = config;
    }

    /**
     * The plugin reserves its own bindings (`resourceOptions`/`requestOptions`),
     * not the core service's — resolving against the wrong set would let a
     * `requestOptions` query parameter capture the plugin's own parameter.
     */
    private argumentNames(operation: NormalizedOperation): ArgumentNames {
        return resolveArgumentNames(operation, this.config, RESOURCE_ARGUMENT_PROFILE);
    }

    generateMethodBody(operation: NormalizedOperation): string {
        const bodyParts = [this.generateDefaultHeaders(operation), this.generateHttpResource(operation)];

        return bodyParts.filter(Boolean).join("\n");
    }

    /**
     * Caller headers flow through `...requestOptions` untouched; a headers
     * merge is only needed when the config declares default headers, the
     * operation derives an Accept header from its response content types, or
     * its body decides the Content-Type.
     */
    private generateDefaultHeaders(operation: NormalizedOperation): string {
        if (!this.mergesHeaders(operation)) {
            return "";
        }
        return emitDefaultHeadersMerge("requestOptions", this.defaultHeaders(operation), {
            dropContentType: operation.isMultipart,
        });
    }

    /** Whether the method computes `headers` itself, and so emits the entry for it. */
    private mergesHeaders(operation: NormalizedOperation): boolean {
        return operation.isMultipart || Object.keys(this.defaultHeaders(operation)).length > 0;
    }

    /**
     * Spec-derived headers first so configured customHeaders can override
     * them. The Content-Type is the one the core service declares
     * (`defaultContentType`); multipart has none, and the merge removes any
     * instead.
     */
    private defaultHeaders(operation: NormalizedOperation): Record<string, string> {
        const emitAccept = this.config.options.emitAcceptHeader ?? true;
        const customHeaders = this.config.options.customHeaders ?? {};
        const derived: Record<string, string> = {};
        if (emitAccept && operation.acceptHeader) {
            derived["Accept"] = operation.acceptHeader;
        }
        // A Content-Type the config sets under another spelling is the same
        // header (names are case-insensitive). Emitting both would let the
        // derived one, checked first, shadow the configured one — the reverse
        // of the core service, where the configured default wins.
        const contentType = defaultContentType(operation);
        const configuresContentType = Object.keys(customHeaders).some((name) => name.toLowerCase() === "content-type");
        if (contentType && !configuresContentType) {
            derived["Content-Type"] = contentType;
        }
        return { ...derived, ...customHeaders };
    }

    /**
     * The body the request carries, read signal-aware like every other
     * argument. Form locals are derived around the arguments instead of
     * reserved (see RESOURCE_ARGUMENT_PROFILE), so a field named `formData`
     * cannot capture the container it is appended to.
     */
    private resourceBody(operation: NormalizedOperation): ResourceBody | undefined {
        const argumentNames = this.argumentNames(operation);
        switch (operation.bodyKind) {
            case "multipart": {
                const container = deriveLocalName("formData", argumentNames.all);
                return {
                    setup: emitMultipartFormData(operation, argumentNames, { container, signalAware: true }),
                    expression: container,
                };
            }
            case "urlencoded": {
                const container = deriveLocalName("formBody", argumentNames.all);
                return {
                    setup: emitUrlEncodedFormBody(operation, argumentNames, { container, signalAware: true }),
                    expression: `${container}.toString()`,
                };
            }
            // One argument, passed through as it is.
            case "json":
            case "text":
            case "binary":
                return argumentNames.body
                    ? { setup: "", expression: signalAwareParamValue(argumentNames.body) }
                    : undefined;
            default:
                return undefined;
        }
    }

    /**
     * The value sent as the whole query string, read once into a local: the
     * URL expression uses it twice when it is optional, and a signal is read
     * as few times as it has to be.
     */
    private queryString(operation: NormalizedOperation): { setup: string; emit: QueryStringEmit } | undefined {
        const argumentNames = this.argumentNames(operation);
        if (!operation.queryString || !argumentNames.queryString) {
            return undefined;
        }
        const local = deriveLocalName(`${argumentNames.queryString}Value`, argumentNames.all);
        return {
            setup: `\nconst ${local} = ${signalAwareParamValue(argumentNames.queryString)};`,
            emit: { value: local, kind: operation.queryString.kind, required: operation.queryString.required },
        };
    }

    private generateRequestOptions(
        operation: NormalizedOperation,
        body: ResourceBody | undefined,
        queryString: QueryStringEmit | undefined,
    ): string {
        const entries: string[] = [];
        const url = emitUrlExpression(
            operation.path,
            operation.pathParams,
            this.argumentNames(operation),
            signalAwareParamValue,
            queryString,
        );

        // Computed entries come after the spread so that caller-supplied
        // request options cannot clobber the body, the merged headers, the
        // accumulated params, or the client-id context.
        entries.push(`url: ${url}`);
        // One of two known words, not spec text: only the RESOURCE_METHODS of
        // http-resource.generator.ts (GET, QUERY) get a resource method.
        entries.push(`method: "${operation.method}"`);
        entries.push("...requestOptions");

        if (body) {
            entries.push(`body: ${body.expression}`);
        }

        if (operation.queryParams.length > 0) {
            entries.push("params");
        }

        if (this.mergesHeaders(operation)) {
            entries.push("headers");
        }

        entries.push("context: this.createContextWithClientId(requestOptions?.context)");

        const formattedOptions = joinRequestOptionEntries(entries);

        return `return {
  ${formattedOptions}
}`;
    }

    /**
     * The options handed to httpResource. A response in a sequential media
     * type that is declared complete is fetched as text and split into its
     * items by a default `parse`; the caller's own options come after it, so
     * a `parse` of theirs replaces it.
     */
    private resourceOptionsArgument(operation: NormalizedOperation): string {
        const sequence = operation.responseSequence;
        if (!sequence || sequence.itemSchema) {
            return "resourceOptions";
        }
        // The return type is spelled out: left to inference, the parser's own
        // type parameter would make the resource one of `unknown[]`.
        const itemsType = this.sequenceItemsType(operation);
        return `{ parse: (text: string): ${itemsType} => ${emitSequenceParser(sequence.format)}(text), ...resourceOptions }`;
    }

    /** The array a complete sequential response is declared as: the type of the response it was found on. */
    private sequenceItemsType(operation: NormalizedOperation): string {
        for (const statusCode of ["200", "201", "202", "204", "206"]) {
            const response = operation.responses?.[statusCode];
            if (response) {
                return getResponseType(response, this.config);
            }
        }
        return "unknown[]";
    }

    private generateHttpResource(operation: NormalizedOperation): string {
        const body = this.resourceBody(operation);
        const queryString = this.queryString(operation);
        const resourceOptions = this.generateRequestOptions(operation, body, queryString?.emit);
        const queryParams = emitSignalAwareQueryParams(operation.queryParams, this.argumentNames(operation));
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
        // No hand-rolled indentation: the generator's final formatText() pass
        // is the single authority for generated-code layout.
        return `return ${httpResource}(() => {${queryParams}${queryString?.setup ?? ""}${body?.setup ?? ""}
${resourceOptions}
}, ${this.resourceOptionsArgument(operation)});`;
    }
}
