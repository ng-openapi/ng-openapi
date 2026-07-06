/**
 * Converts a string to camelCase. Dots, dashes, underscores and whitespace are
 * treated as word separators and removed (`"pet_id"` → `"petId"`,
 * `"filter.name"` → `"filterName"`).
 */
export function camelCase(str: string): string {
    return str
        .replace(/[-_.\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
        .replace(/^./, (char) => char.toLowerCase());
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
 * are treated as word separators and removed (`"pet_store"` → `"PetStore"`).
 */
export function pascalCase(str: string): string {
    return str
        .replace(/[-_.\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
        .replace(/^./, (char) => char.toUpperCase());
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
