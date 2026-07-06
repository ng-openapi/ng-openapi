import {
    emitDefaultHeadersMerge,
    emitSignalAwareQueryParams,
    emitUrlExpression,
    joinRequestOptionEntries,
    MethodGenOptions,
    NormalizedOperation,
    signalAwareParamValue,
} from "@ng-openapi/shared";

export class HttpResourceMethodBodyGenerator {
    private config: MethodGenOptions;

    constructor(config: MethodGenOptions) {
        this.config = config;
    }

    generateMethodBody(operation: NormalizedOperation): string {
        const bodyParts = [this.generateDefaultHeaders(operation), this.generateHttpResource(operation)];

        return bodyParts.filter(Boolean).join("\n");
    }

    /**
     * Caller headers flow through `...requestOptions` untouched; a headers
     * merge is only needed when the config declares default headers or the
     * operation derives an Accept header from its response content types.
     */
    private generateDefaultHeaders(operation: NormalizedOperation): string {
        const defaultHeaders = this.defaultHeaders(operation);
        if (Object.keys(defaultHeaders).length === 0) {
            return "";
        }
        return emitDefaultHeadersMerge("requestOptions", defaultHeaders);
    }

    /** Spec-derived Accept first so configured customHeaders can override it. */
    private defaultHeaders(operation: NormalizedOperation): Record<string, string> {
        const emitAccept = this.config.options.emitAcceptHeader ?? true;
        return {
            ...(emitAccept && operation.acceptHeader ? { Accept: operation.acceptHeader } : {}),
            ...this.config.options.customHeaders,
        };
    }

    private generateRequestOptions(operation: NormalizedOperation): string {
        const entries: string[] = [];
        const url = emitUrlExpression(operation.path, operation.pathParams, signalAwareParamValue);

        // Computed entries come after the spread so that caller-supplied
        // request options cannot clobber the merged headers, the accumulated
        // params, or the client-id context.
        entries.push(`url: ${url}`);
        entries.push(`method: "GET"`);
        entries.push("...requestOptions");

        if (operation.queryParams.length > 0) {
            entries.push("params");
        }

        if (Object.keys(this.defaultHeaders(operation)).length > 0) {
            entries.push("headers");
        }

        entries.push("context: this.createContextWithClientId(requestOptions?.context)");

        const formattedOptions = joinRequestOptionEntries(entries);

        return `return {
  ${formattedOptions}
}`;
    }

    private generateHttpResource(operation: NormalizedOperation): string {
        const resourceOptions = this.generateRequestOptions(operation);
        const queryParams = emitSignalAwareQueryParams(operation.queryParams);
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
        return `return ${httpResource}(() => {${queryParams}
${resourceOptions}
}, resourceOptions);`;
    }
}
