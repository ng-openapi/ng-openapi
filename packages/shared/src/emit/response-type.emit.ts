import type { ResponseKind } from "../model/operation.model";

/**
 * Returns the request-options entry pinning a non-JSON response type, or ""
 * for JSON (Angular's default). The entry is cast-free: it must be emitted
 * into a contextually typed position (an options literal inlined into the
 * `request()` call) so the literal keeps its narrow type.
 */
export function emitResponseTypeOption(responseType: ResponseKind): string {
    if (responseType === "json") {
        return "";
    }
    return `responseType: '${responseType}'`;
}

/**
 * Joins requestOptions entries, dropping empties and entries whose value is
 * the literal `undefined` (`reportProgress: undefined`), with the indentation
 * both method bodies use.
 *
 * Only that exact shape. Matching the word anywhere dropped an entry that
 * merely mentions it — the `url` of a path like `/undefined-items`, or one
 * whose expression tests a value against `undefined` — and a request without
 * a `url` is not a request.
 */
export function joinRequestOptionEntries(entries: string[]): string {
    return entries.filter((entry) => entry && !/^[\w$]+:\s*undefined$/.test(entry.trim())).join(",\n  ");
}
