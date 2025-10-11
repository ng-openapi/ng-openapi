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
