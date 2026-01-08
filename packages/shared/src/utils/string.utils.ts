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

export function screamingSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[-\s]+/g, "_")
        .toUpperCase();
}

export function pascalCaseForEnums(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/(?:^|_)([a-z])/g, (_, char) => char.toUpperCase())
        .replace(/^([0-9])/, "_$1");
}
