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
 * Joins requestOptions entries, dropping empties and entries referencing
 * undefined values, with the indentation both method bodies use.
 */
export function joinRequestOptionEntries(entries: string[]): string {
    return entries.filter((entry) => entry && !entry.includes("undefined")).join(",\n  ");
}
