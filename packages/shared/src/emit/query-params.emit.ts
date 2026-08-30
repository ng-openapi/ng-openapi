import type { Parameter } from "../types/swagger.types";
import { deriveLocalName } from "../utils/functions/argument-names";
import { quoteLiteral } from "./literal.emit";
import type { ArgumentNames } from "../utils/functions/argument-names";
import { signalAwareParamValue } from "./url.emit";

/**
 * Emits the `HttpParams` accumulation block for the core service method body.
 * Returns "" when the operation has no query parameters.
 */
export function emitQueryParams(queryParams: Parameter[], argumentNames: ArgumentNames): string {
    if (queryParams.length === 0) {
        return "";
    }

    const paramMappings = queryParams
        .map((param) => {
            const identifier = argumentNames.of(param.name);
            return `if (${identifier} != null) {
  params = HttpParamsBuilder.addToHttpParams(params, ${identifier}, ${quoteLiteral(param.name)});
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
export function emitSignalAwareQueryParams(queryParams: Parameter[], argumentNames: ArgumentNames): string {
    if (queryParams.length === 0) {
        return "";
    }

    const paramMappings = queryParams
        .map((param) => {
            const identifier = argumentNames.of(param.name);
            // The temp is a new binding in the method body, so it has to avoid
            // the parameters: query params `foo` and `fooValue` would otherwise
            // both want `fooValue`, and the shadowed one would silently
            // transmit the other's value.
            const local = deriveLocalName(`${identifier}Value`, argumentNames.all);
            return `const ${local} = ${signalAwareParamValue(identifier)};
                if (${local} != null) {
                    params = HttpParamsBuilder.addToHttpParams(params, ${local}, ${quoteLiteral(param.name)});
                }`;
        })
        .join("\n");

    return `
let params = new HttpParams();
${paramMappings}`;
}
