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

// Multi-client configuration for providers
export interface NgOpenapiClientConfig {
    clientName: string; // Unique identifier for this client
    basePath: string;
    enableDateTransform?: boolean;
    interceptors?: (new (...args: HttpInterceptor[]) => HttpInterceptor)[]; // Array of interceptor classes
}
