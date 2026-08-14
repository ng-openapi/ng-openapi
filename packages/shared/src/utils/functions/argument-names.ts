import { camelCase } from "../string.utils";

/**
 * Identifiers the generated method body already binds. A spec parameter that
 * camelCases onto one of these would shadow it: `observe`/`options` are the
 * method's own trailing parameters, the rest are locals its body declares
 * (see `emit/url.emit.ts`, `emit/query-params.emit.ts`, `emit/headers.emit.ts`
 * and the form-data blocks of `service-method-body.generator.ts`).
 */
const RESERVED_ARGUMENT_NAMES = ["observe", "options", "url", "params", "headers", "formData", "formBody"];

/**
 * Maps each of an operation's wire names to the TypeScript identifier the
 * generated method uses for it.
 *
 * Wire names are free-form: `filter[name]` and `filter.name` both camelCase to
 * `filterName`, and `options[]` collides with the generator's own `options`
 * parameter. Resolving them one at a time — as every call site used to, via
 * `camelCase(param.name)` — cannot see those collisions, so one parameter
 * silently won and the other became unreachable while still emitting its own
 * `addToHttpParams` call under the winner's value. Assigning all of an
 * operation's identifiers together is the only way to keep them distinct, so
 * generators read this map instead of re-deriving names.
 *
 * Order is significant and must stay stable: it decides which parameter keeps
 * the unsuffixed name.
 */
export function resolveArgumentNames(orderedWireNames: string[]): Record<string, string> {
    const argumentNames: Record<string, string> = {};
    const used = new Set(RESERVED_ARGUMENT_NAMES);

    for (const wireName of orderedWireNames) {
        // The same wire name in two locations (a path and a query `id`) is one
        // method parameter, as the generators' dedupe has always treated it.
        if (argumentNames[wireName] !== undefined) {
            continue;
        }

        const base = camelCase(wireName);
        let identifier = base;
        let suffix = 2;
        while (used.has(identifier)) {
            identifier = `${base}${suffix}`;
            suffix++;
        }

        used.add(identifier);
        argumentNames[wireName] = identifier;
    }

    return argumentNames;
}

/**
 * The identifier assigned to `wireName`. The fallback keeps callers total for
 * operations built outside the normalizer (tests, plugin fixtures); a resolved
 * map always contains every wire name of its operation.
 */
export function argumentNameOf(argumentNames: Record<string, string>, wireName: string): string {
    return argumentNames[wireName] ?? camelCase(wireName);
}
