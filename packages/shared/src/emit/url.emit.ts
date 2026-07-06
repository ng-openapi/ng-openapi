import type { Parameter } from "../types/swagger.types";
import { camelCase } from "../utils/string.utils";

/** Identity read: the parameter identifier is a plain value. */
export function plainParamValue(identifier: string): string {
    return identifier;
}

/** Signal-aware read used by the http-resource plugin: the value may be a signal → call it. */
export function signalAwareParamValue(identifier: string): string {
    return `typeof ${identifier} === 'function' ? ${identifier}() : ${identifier}`;
}

/**
 * Builds the request-URL template literal, substituting `{param}` placeholders
 * with the (camelCased) method parameter identifiers.
 */
export function emitUrlExpression(
    path: string,
    pathParams: Parameter[],
    paramValue: (identifier: string) => string = plainParamValue,
): string {
    let urlExpression = `\`\${this.basePath}${path}\``;

    pathParams.forEach((param) => {
        urlExpression = urlExpression.replace(`{${param.name}}`, `\${${paramValue(camelCase(param.name))}}`);
    });

    return urlExpression;
}

/** `const url = …;` statement used by the core service method body. */
export function emitUrlConstruction(path: string, pathParams: Parameter[]): string {
    return `const url = ${emitUrlExpression(path, pathParams)};`;
}
