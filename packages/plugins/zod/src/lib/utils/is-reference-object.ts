export function isReferenceObject(obj: unknown): obj is { $ref: string } {
    return typeof obj === "object" && obj !== null && "$ref" in obj;
}
