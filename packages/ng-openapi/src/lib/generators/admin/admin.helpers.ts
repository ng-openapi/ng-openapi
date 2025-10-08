/**
 * A simple pluralization function.
 * Handles common cases like words ending in 's', 'x', 'z', 'sh', 'ch', and 'y'.
 */
export function plural(word: string): string {
    if (/(ss|s|x|z|sh|ch)$/i.test(word)) {
        return word + 'es';
    }
    if (/[^aeiou]y$/i.test(word)) {
        return word.slice(0, -1) + 'ies';
    }
    if (word.endsWith('s')) {
        return word;
    }
    return word + 's';
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
