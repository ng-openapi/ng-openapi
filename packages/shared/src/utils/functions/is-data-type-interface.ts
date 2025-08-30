export function isDataTypeInterface(type: string): boolean {
    const invalidTypes = ["any", "File", "string", "number", "boolean", "object", "unknown", "[]", "Array"];
    return !invalidTypes.some((invalidType) => type.includes(invalidType));
}
