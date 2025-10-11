export function camelCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
        .replace(/^./, (char) => char.toLowerCase());
}

export function kebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[-_\s]+/g, "-")
        .toLowerCase();
}

export function pascalCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
        .replace(/^./, (char) => char.toUpperCase());
}

/**
 * Converts a camelCase or snake_case string to a capitalized title.
 * e.g., "helloWorld" -> "Hello World"
 * e.g., "is_admin" -> "Is Admin"
 */
export function titleCase(str: string): string {
    if (!str) return '';

    return str
        // Split on uppercase letters and underscores/dashes
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        // Capitalize the first letter of each word
        .replace(/\b\w/g, char => char.toUpperCase())
        // Remove leading space if any
        .trim();
}

export function screamingSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[-\s]+/g, "_")
        .toUpperCase();
}
