import type { SwaggerDefinition } from "../types/swagger.types";
import type { NormalizedOperation } from "./operation.model";

/** Detected spec flavor and its literal version string (e.g. openapi "3.0.3"). */
export interface SpecVersion {
    type: "swagger" | "openapi";
    version: string;
}

/** Descriptive metadata from the spec's `info` object, as authored. */
export interface SpecInfo {
    title?: string;
    version?: string;
    description?: string;
}

/**
 * Version-free view of a parsed spec: Swagger 2.0 vs OpenAPI 3.x differences
 * are resolved once at normalization time. Generators consume this instead of
 * touching the raw SwaggerSpec.
 */
export interface NormalizedSpec {
    version: SpecVersion | null;
    /** The spec's `info` block; its `version` defaults a generated package's own version. */
    info?: SpecInfo;
    /** 2.0 `definitions` or 3.x `components.schemas`, whichever the spec has */
    definitions: Record<string, SwaggerDefinition>;
    operations: NormalizedOperation[];
    /** Lookup for "#/definitions/X" and "#/components/schemas/X" style refs */
    resolveReference(ref: string): SwaggerDefinition | undefined;
}
