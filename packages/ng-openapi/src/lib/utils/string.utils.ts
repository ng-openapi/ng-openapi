export function camelCase(str: string): string {
    const cleaned = str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
    return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

export function kebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function pascalCase(str: string): string {
    return str.replace(/(?:^|[-_])([a-z])/g, (_, char) => char.toUpperCase());
}