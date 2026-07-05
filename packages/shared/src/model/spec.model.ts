import type { SwaggerDefinition } from "../types/swagger.types";
import type { NormalizedOperation } from "./operation.model";

export interface SpecVersion {
    type: "swagger" | "openapi";
    version: string;
}

/**
 * Version-free view of a parsed spec: Swagger 2.0 vs OpenAPI 3.x differences
 * are resolved once at normalization time. Generators consume this instead of
 * touching the raw SwaggerSpec.
 */
export interface NormalizedSpec {
    version: SpecVersion | null;
    /** 2.0 `definitions` or 3.x `components.schemas`, whichever the spec has */
    definitions: Record<string, SwaggerDefinition>;
    operations: NormalizedOperation[];
    /** Lookup for "#/definitions/X" and "#/components/schemas/X" style refs */
    resolveReference(ref: string): SwaggerDefinition | undefined;
}
