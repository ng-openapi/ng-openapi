/**
 * Determines if input is a URL
 */
export function isUrl(input: string): boolean {
    try {
        const url = new URL(input);
        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
}