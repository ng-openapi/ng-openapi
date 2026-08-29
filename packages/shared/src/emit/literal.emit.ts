/**
 * Wire names and header values are free-form spec text that ends up inside
 * emitted *string literals*, not just identifiers. Hardening the identifier
 * path left these unguarded:
 *
 * - a quote closes the literal early, which is a syntax error;
 * - a backslash is worse because it is silent: the emitted literal means a
 *   different string, so the wrong name goes on the wire and still compiles;
 * - a backtick or an interpolation opener inside a template literal (the
 *   request URL) ends the literal or starts an interpolation, failing with the
 *   same opaque ts-morph error as #125.
 *
 * Every emitted literal built from spec text must go through one of these.
 */

/** A single-quoted TypeScript string literal holding exactly `value`. */
export function quoteLiteral(value: string): string {
    return `'${escapeSingleQuoted(value)}'`;
}

/** The inside of a single-quoted literal — use when the quotes are already there. */
export function escapeSingleQuoted(value: string): string {
    return value
        .replace(/[\\']/g, (char) => `\\${char}`)
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

/**
 * Escapes `value` for a position inside a template literal, where a backtick
 * ends the literal and `${` opens an interpolation.
 */
export function escapeTemplateLiteral(value: string): string {
    return value
        .replace(/[\\`]/g, (char) => `\\${char}`)
        .replace(/\$\{/g, "\\${")
        // A lone CR inside a template literal is normalized to LF by the
        // language, silently changing the value.
        .replace(/\r/g, "\\r");
}

/**
 * An object-literal property key holding exactly `name`.
 *
 * `__proto__` is the one key whose *literal* form carries semantics: as a plain
 * or quoted property key it invokes the prototype setter and creates no own
 * property, so the field silently disappears from the emitted object. A
 * computed key is an ordinary key — used only where it is needed, so normal
 * generated output keeps the more readable quoted form.
 */
export function emitObjectKey(name: string, quoteStyle: "single" | "double" = "double"): string {
    // The quote style is cosmetic and follows the surrounding generated code;
    // only the computed-key decision is semantic.
    const quoted = quoteStyle === "single" ? quoteLiteral(name) : `"${escapeDoubleQuoted(name)}"`;
    return name === "__proto__" ? `[${quoted}]` : quoted;
}

/** The inside of a double-quoted literal. */
export function escapeDoubleQuoted(value: string): string {
    return value
        .replace(/[\\"]/g, (char) => `\\${char}`)
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

/**
 * A property name in a *declaration* position (an interface member, a type
 * literal): the bare identifier when it is one, otherwise a quoted and escaped
 * key.
 *
 * The unescaped `"${name}"` this replaces emitted `"say"hi"` for the legal
 * property name `say"hi` — three syntax errors in one model file from a valid
 * spec, with generation reporting success. `__proto__` needs no special
 * treatment here: a declaration has no prototype setter to invoke, unlike the
 * object-literal position that `emitObjectKey` serves.
 */
export function emitPropertyName(name: string): string {
    return IDENTIFIER_NAME.test(name) ? name : `"${escapeDoubleQuoted(name)}"`;
}

/** Names emittable bare, without quotes. Deliberately ASCII-conservative. */
const IDENTIFIER_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Escapes text for a JSDoc block.
 *
 * A `*` followed by `/` closes the comment, so a description containing one
 * ends the block early and everything after it is emitted as code. From a
 * remote spec — ng-openapi accepts a URL as input — that writes arbitrary
 * declarations into the consumer's source tree, and at definition level the
 * result is valid TypeScript, so it compiles and no compile assertion sees it.
 *
 * `*\/` is the standard neutralization (TypeScript's own emitter does the
 * same): the backslash has no meaning inside a comment, so it renders as
 * written and cannot terminate the block.
 */
export function escapeJsDoc(text: string): string {
    return text.replace(/\*\//g, "*\\/");
}

/**
 * The `docs` array for a ts-morph structure, or undefined when there is no
 * description. Every generator goes through this rather than building
 * `[description]` inline, so the escape cannot be forgotten at one of the eight
 * call sites.
 */
export function emitDocs(description: string | undefined): string[] | undefined {
    return description ? [escapeJsDoc(description)] : undefined;
}
