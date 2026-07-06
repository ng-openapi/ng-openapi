/**
 * Whether a rendered TS type expression refers to a generated model interface
 * (as opposed to a primitive, `File`, an array or an inline shape) — used to
 * decide parameter naming in generated methods.
 */
export function isDataTypeInterface(type: string): boolean {
    const invalidTypes = ["any", "File", "string", "number", "boolean", "object", "unknown", "[]", "Array"];
    return !invalidTypes.some((invalidType) => type.includes(invalidType));
}
