/**
 * Plain objects only — anything with a class prototype is *not* rebuildable
 * key by key. js-yaml's default schema turns unquoted timestamps into `Date`s
 * (`example: 2020-01-01`), and `Object.entries(new Date())` is `[]`, so a
 * loose predicate would silently flatten every such value to `{}`.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
