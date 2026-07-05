import type { ModuleKind, ScriptTarget } from "ts-morph";
import type { HttpInterceptor } from "@angular/common/http";
import type { SwaggerSpec } from "./swagger.types";
import type { IPluginGeneratorClass } from "./plugin.types";

export interface GeneratorConfig {
    input: string;
    output: string;
    clientName?: string;
    validateInput?: (spec: SwaggerSpec) => boolean;
    options: {
        dateType: "string" | "Date";
        enumStyle: "enum" | "union";
        validation?: {
            response?: boolean;
        };
        generateServices?: boolean;
        generateEnumBasedOnDescription?: boolean;
        customHeaders?: Record<string, string>;
        responseTypeMapping?: {
            [contentType: string]: "json" | "blob" | "arraybuffer" | "text";
        };
        customizeMethodName?: (operationId: string) => string;
        useSingleRequestParameter?: boolean;
    };
    compilerOptions?: {
        declaration?: boolean;
        target?: ScriptTarget;
        module?: ModuleKind;
        strict?: boolean;
    };
    plugins?: IPluginGeneratorClass[];
}

/**
 * Segregated views of GeneratorConfig (REFACTORING_PLAN.md phase 2.4).
 * Generators declare the slice they actually consume; callers keep passing the
 * full GeneratorConfig, which satisfies every view structurally. Only the
 * user-facing boundary (CLI/orchestrator) and the plugin contract see the
 * whole config.
 */

/** What swagger→TypeScript type mapping needs (getTypeScriptType and friends). */
export interface TypeMappingConfig {
    options: {
        dateType: "string" | "Date";
    };
}

/** Options consumed by model/interface generation (TypeGenerator). */
export interface TypeGenOptions {
    options: {
        dateType: "string" | "Date";
        enumStyle: "enum" | "union";
        generateEnumBasedOnDescription?: boolean;
        validation?: {
            response?: boolean;
        };
    };
}

/** Options consumed by the service/resource method-generation chain. */
export interface MethodGenOptions {
    options: {
        dateType: "string" | "Date";
        validation?: {
            response?: boolean;
        };
        customHeaders?: Record<string, string>;
        customizeMethodName?: (operationId: string) => string;
        useSingleRequestParameter?: boolean;
    };
}

// Multi-client configuration for providers
export interface NgOpenapiClientConfig {
    clientName: string; // Unique identifier for this client
    basePath: string;
    enableDateTransform?: boolean;
    interceptors?: (new (...args: HttpInterceptor[]) => HttpInterceptor)[]; // Array of interceptor classes
}
