export function camelCase(str: string): string {
    if (!str) return '';
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
        .replace(/^./, (char) => char.toLowerCase());
}

export function kebabCase(str: string): string {
    if (!str) return '';
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[-_\s]+/g, "-")
        .toLowerCase();
}

export function pascalCase(str: string): string {
    if (!str) return '';
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
        .replace(/^./, (char) => char.toUpperCase());
}

/**
 * Converts a string into a human-readable Title Case format.
 * - Splits camelCase, snake_case, and kebab-case.
 * - Capitalizes the first letter of each word.
 * - Preserves existing all-caps words (like "SERVERS").
 * e.g., "rebootServer" -> "Reboot Server"
 * e.g., "reindex SERVERS" -> "Reindex SERVERS"
 */
export function titleCase(str: string): string {
    if (!str) return '';

    return str
        // Split camelCase words, e.g., "rebootServer" -> "reboot Server"
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        // Replace underscores and hyphens with spaces
        .replace(/[_-]/g, ' ')
        // Capitalize the first letter of each word
        .replace(/\b\w/g, char => char.toUpperCase())
        // Condense multiple spaces into one
        .replace(/\s+/g, ' ')
        .trim();
}

export function screamingSnakeCase(str: string): string {
    if (!str) return '';
    return str
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[-\s]+/g, "_")
        .toUpperCase();
}
