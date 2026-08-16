import type { Parameter } from "../types/swagger.types";
import type { ArgumentNames } from "../utils/functions/argument-names";

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
 * with the method parameter identifiers `argumentNames` assigned.
 */
export function emitUrlExpression(
    path: string,
    pathParams: Parameter[],
    argumentNames: ArgumentNames,
    paramValue: (identifier: string) => string = plainParamValue,
): string {
    let urlExpression = `\`\${this.basePath}${path}\``;

    pathParams.forEach((param) => {
        const replacement = `\${${paramValue(argumentNames.of(param.name))}}`;
        // A replacer function, not a replacement string: `$` is legal in an
        // identifier (`$top`, and `camelCase` preserves it deliberately), and
        // in a replacement string `$$`/`$&`/`` $` `` are substitution patterns —
        // a `{a$$b}` path parameter would emit `${a$b}` and not compile.
        urlExpression = urlExpression.replace(`{${param.name}}`, () => replacement);
    });

    return urlExpression;
}

/** `const url = …;` statement used by the core service method body. */
export function emitUrlConstruction(path: string, pathParams: Parameter[], argumentNames: ArgumentNames): string {
    return `const url = ${emitUrlExpression(path, pathParams, argumentNames)};`;
}
