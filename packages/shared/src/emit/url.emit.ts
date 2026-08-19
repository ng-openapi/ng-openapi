import { UnresolvedPathTemplateError } from "../errors";
import type { Parameter } from "../types/swagger.types";
import type { ArgumentNames } from "../utils/functions/argument-names";
import { escapeTemplateLiteral } from "./literal.emit";

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
    // A placeholder with no declared parameter used to ship verbatim in every
    // request URL. That compiles, so neither the compile assertions nor the
    // golden snapshots could see it — checked here against the raw path, before
    // any substitution.
    const declared = new Set(pathParams.map((param) => param.name));
    const unresolved = (path.match(/{([^{}]*)}/g) ?? [])
        .map((placeholder) => placeholder.slice(1, -1))
        .filter((name) => !declared.has(name));
    if (unresolved.length > 0) {
        throw new UnresolvedPathTemplateError(
            `Path "${path}" declares no parameter for ${unresolved.map((name) => `{${name}}`).join(", ")}. ` +
                `Declare each placeholder as a path parameter, or remove it from the path.`,
            path,
            unresolved,
        );
    }

    // The path is spec text going inside a template literal, so a backtick or a
    // literal "${" in it would close the literal or open an interpolation.
    let urlExpression = "`${this.basePath}" + escapeTemplateLiteral(path) + "`";

    pathParams.forEach((param) => {
        const replacement = "${" + paramValue(argumentNames.of(param.name)) + "}";
        // split/join, not replace: it substitutes *every* occurrence — a
        // placeholder may legitimately repeat ("/a/{id}/b/{id}"), and `replace`
        // with a string pattern takes only the first, shipping the rest as
        // literal "{id}" — and it interprets no substitution patterns, so a `$`
        // in the identifier ($top, which camelCase preserves on purpose) stays
        // literal instead of becoming `$$` → `$`.
        urlExpression = urlExpression.split(`{${escapeTemplateLiteral(param.name)}}`).join(replacement);
    });

    return urlExpression;
}

/** `const url = …;` statement used by the core service method body. */
export function emitUrlConstruction(path: string, pathParams: Parameter[], argumentNames: ArgumentNames): string {
    return `const url = ${emitUrlExpression(path, pathParams, argumentNames)};`;
}
