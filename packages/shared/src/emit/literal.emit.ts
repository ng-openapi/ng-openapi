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
        .replace(/\$\{/g, "\\${");
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
export function emitObjectKey(name: string): string {
    const quoted = `"${escapeDoubleQuoted(name)}"`;
    return name === "__proto__" ? `[${quoted}]` : quoted;
}

/** The inside of a double-quoted literal. */
function escapeDoubleQuoted(value: string): string {
    return value
        .replace(/[\\"]/g, (char) => `\\${char}`)
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}
