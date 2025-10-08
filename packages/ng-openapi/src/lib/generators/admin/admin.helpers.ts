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
 * Converts a string to Title Case.
 * e.g., "hello world" -> "Hello World"
 */
export function titleCase(str: string): string {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}
