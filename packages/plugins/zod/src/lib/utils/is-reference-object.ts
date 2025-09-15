export function isReferenceObject(obj: any): obj is { $ref: string } {
    return obj && typeof obj === 'object' && '$ref' in obj;
}