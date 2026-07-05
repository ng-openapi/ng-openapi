import type { Parameter } from "../types/swagger.types";
import { camelCase } from "../utils/string.utils";
import { signalAwareParamValue } from "./url.emit";

/**
 * Emits the `HttpParams` accumulation block for the core service method body.
 * Returns "" when the operation has no query parameters.
 */
export function emitQueryParams(queryParams: Parameter[]): string {
    if (queryParams.length === 0) {
        return "";
    }

    const paramMappings = queryParams
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

/**
 * Signal-aware variant for the http-resource plugin: each parameter may be a
 * signal, so its value is read once before the null check.
 */
export function emitSignalAwareQueryParams(queryParams: Parameter[]): string {
    if (queryParams.length === 0) {
        return "";
    }

    const paramMappings = queryParams
        .map(
            (param) =>
                `const ${camelCase(param.name)}Value = ${signalAwareParamValue(camelCase(param.name))};
                if (${camelCase(param.name)}Value != null) {
                    params = HttpParamsBuilder.addToHttpParams(params, ${camelCase(param.name)}Value, '${param.name}');
                }`,
        )
        .join("\n");

    return `
let params = new HttpParams();
${paramMappings}`;
}
