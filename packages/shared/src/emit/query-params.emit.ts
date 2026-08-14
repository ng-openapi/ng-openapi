import type { Parameter } from "../types/swagger.types";
import { argumentNameOf } from "../utils/functions/argument-names";
import { signalAwareParamValue } from "./url.emit";

/**
 * Emits the `HttpParams` accumulation block for the core service method body.
 * Returns "" when the operation has no query parameters.
 */
export function emitQueryParams(queryParams: Parameter[], argumentNames: Record<string, string>): string {
    if (queryParams.length === 0) {
        return "";
    }

    const paramMappings = queryParams
        .map((param) => {
            const identifier = argumentNameOf(argumentNames, param.name);
            return `if (${identifier} != null) {
  params = HttpParamsBuilder.addToHttpParams(params, ${identifier}, '${param.name}');
}`;
        })
        .join("\n");

    return `
let params = new HttpParams();
${paramMappings}`;
}

/**
 * Signal-aware variant for the http-resource plugin: each parameter may be a
 * signal, so its value is read once before the null check.
 */
export function emitSignalAwareQueryParams(queryParams: Parameter[], argumentNames: Record<string, string>): string {
    if (queryParams.length === 0) {
        return "";
    }

    const paramMappings = queryParams
        .map((param) => {
            const identifier = argumentNameOf(argumentNames, param.name);
            return `const ${identifier}Value = ${signalAwareParamValue(identifier)};
                if (${identifier}Value != null) {
                    params = HttpParamsBuilder.addToHttpParams(params, ${identifier}Value, '${param.name}');
                }`;
        })
        .join("\n");

    return `
let params = new HttpParams();
${paramMappings}`;
}
