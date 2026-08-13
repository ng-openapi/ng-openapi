/**
 * Every character that cannot appear inside a TypeScript identifier, plus `_`,
 * which is a legal identifier character but has always been a word separator
 * here (`"pet_id"` → `"petId"`). Anything the language accepts is kept, so
 * Unicode-letter names (`"größe"`) and `$`-prefixed OData names (`"$top"`)
 * survive untouched instead of being mangled into a different identifier.
 */
const IDENTIFIER_SEPARATORS = /(?:_|[^\p{ID_Continue}$])+(.)?/gu;

/** A first character the language rejects — digits, combining marks — needs an `_` in front. */
const INVALID_IDENTIFIER_START = /^[^\p{ID_Start}$_]/u;

/**
 * Makes `converted` usable as a TypeScript identifier: guards against a
 * leading digit, and never returns an empty string for a non-empty input
 * (a name of nothing but separators, `"{}"`, would otherwise emit a syntax
 * error). Callers rely on this being total — parameter identifiers are
 * derived independently at their declaration and at every use site
 * (`emit/url.emit.ts`, `emit/query-params.emit.ts`), so the mapping has to
 * agree everywhere rather than be repaired per call site.
 */
function toIdentifier(converted: string, original: string): string {
    if (converted === "") {
        return original === "" ? "" : "_";
    }
    return converted.replace(INVALID_IDENTIFIER_START, (char) => `_${char}`);
}

/**
 * Whether `name` can be emitted as-is as a TypeScript identifier. Only needed
 * for names ng-openapi did not derive itself — everything out of `camelCase`
 * and `pascalCase` already satisfies this.
 */
export function isValidIdentifier(name: string): boolean {
    return /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u.test(name);
}

/**
 * Converts a string to camelCase. Dots, dashes, underscores and whitespace are
 * treated as word separators and removed (`"pet_id"` → `"petId"`,
 * `"filter.name"` → `"filterName"`), as is every other character illegal in a
 * TypeScript identifier (`"groups_{group_id}_delete"` →
 * `"groupsGroupIdDelete"`), so the result is always a valid identifier.
 */
export function camelCase(str: string): string {
    const converted = str
        .replace(IDENTIFIER_SEPARATORS, (_, char: string | undefined) => (char ? char.toUpperCase() : ""))
        .replace(/^./u, (char) => char.toLowerCase());
    return toIdentifier(converted, str);
}

/** Converts a string to kebab-case (`"PetStore"` → `"pet-store"`). */
export function kebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[-_\s]+/g, "-")
        .toLowerCase();
}

/**
 * Converts a string to PascalCase. Dots, dashes, underscores and whitespace
 * are treated as word separators and removed (`"pet_store"` → `"PetStore"`), as
 * is every other character illegal in a TypeScript identifier
 * (`"Groups (yes)"` → `"GroupsYes"`), so the result is always a valid
 * identifier — service and resource class names are built from it.
 */
export function pascalCase(str: string): string {
    const converted = str
        .replace(IDENTIFIER_SEPARATORS, (_, char: string | undefined) => (char ? char.toUpperCase() : ""))
        .replace(/^./u, (char) => char.toUpperCase());
    return toIdentifier(converted, str);
}

/** Converts a string to SCREAMING_SNAKE_CASE (`"PetStore"` → `"PET_STORE"`) — used for token names. */
export function screamingSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[-\s]+/g, "_")
        .toUpperCase();
}

/**
 * PascalCase variant safe for generated type/enum identifiers: every
 * non-alphanumeric character is a separator, and a leading digit is
 * prefixed with `_` so the result is always a valid TS identifier.
 */
export function pascalCaseForEnums(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/(?:^|_)([a-z])/g, (_, char) => char.toUpperCase())
        .replace(/^([0-9])/, "_$1");
}
