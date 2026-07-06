import type { ModuleKind, ScriptTarget } from "ts-morph";
import type { HttpInterceptor } from "@angular/common/http";
import type { SwaggerSpec } from "./swagger.types";
import type { IPluginGeneratorClass } from "./plugin.types";

/**
 * Prefix/suffix decoration for one category of generated identifiers.
 * A prefix is prepended verbatim and must be a valid identifier start.
 * For services/resources the suffix replaces the default
 * "Service"/"Resource" (an empty string drops it); for models it is
 * plainly appended (models have no default suffix).
 */
export interface NameDecoration {
    prefix?: string;
    suffix?: string;
}

/**
 * Identifier decoration for generated classes/types. File names are
 * unaffected; model decoration applies to schema-derived types only
 * (request-params interfaces and zod schemas keep their operation-derived
 * names).
 */
export interface NamingOptions {
    services?: NameDecoration;
    resources?: NameDecoration;
    models?: NameDecoration;
}

/**
 * The user-facing configuration (config file or programmatic call).
 * Validated at the boundary by validateGeneratorConfig, which throws
 * ConfigValidationError listing every problem at once — see
 * https://ng-openapi.dev for full option documentation.
 */
export interface GeneratorConfig {
    /** Path or http(s) URL of the OpenAPI 3.x / Swagger 2.x spec (.json/.yaml/.yml). */
    input: string;
    /** Output directory; created if missing. */
    output: string;
    /** Distinguishes tokens/providers when several clients coexist in one app. */
    clientName?: string;
    /** Custom acceptance check run on the parsed spec; returning false aborts generation. */
    validateInput?: (spec: SwaggerSpec) => boolean;
    options: {
        /** How date/date-time formats are typed in generated models. */
        dateType: "string" | "Date";
        /** Emit TS enums or literal-union types for spec enums. */
        enumStyle: "enum" | "union";
        validation?: {
            /** Adds a `parse` hook to RequestOptions for response validation. */
            response?: boolean;
        };
        /** Set false to generate models only. Default: true. */
        generateServices?: boolean;
        /** Read enum member names from JSON-encoded descriptions (see EnumValueObject). */
        generateEnumBasedOnDescription?: boolean;
        /** Default headers added to every request when not already present. */
        customHeaders?: Record<string, string>;
        /** Pin the Angular responseType per response content type. */
        responseTypeMapping?: {
            [contentType: string]: "json" | "blob" | "arraybuffer" | "text";
        };
        /** Derive method names from operationIds; throws when an operation has none. */
        customizeMethodName?: (operationId: string) => string;
        /** Collapse each method's parameters into a single request object. */
        useSingleRequestParameter?: boolean;
        /**
         * Class decorator emitted on generated services/resources. `"service"`
         * emits Angular 22+'s `@Service()` (pre-release; shorthand for exactly
         * `@Injectable({ providedIn: "root" })`) — generated code will not
         * compile on Angular ≤ 21. Default: `"injectable"`.
         */
        serviceDecorator?: "injectable" | "service";
        /** Prefix/suffix decoration of generated service/resource/model identifiers. */
        naming?: NamingOptions;
    };
    /** Overrides for the ts-morph compiler settings used during generation. */
    compilerOptions?: {
        declaration?: boolean;
        target?: ScriptTarget;
        module?: ModuleKind;
        strict?: boolean;
    };
    /** Plugin generator classes, run after core generation (see PluginGeneratorContext). */
    plugins?: IPluginGeneratorClass[];
}

/**
 * Segregated views of GeneratorConfig.
 * Generators declare the slice they actually consume; callers keep passing the
 * full GeneratorConfig, which satisfies every view structurally. Only the
 * user-facing boundary (CLI/orchestrator) and the plugin contract see the
 * whole config.
 */

/** What swagger→TypeScript type mapping needs (getTypeScriptType and friends). */
export interface TypeMappingConfig {
    options: {
        dateType: "string" | "Date";
        naming?: {
            models?: NameDecoration;
        };
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
        naming?: {
            models?: NameDecoration;
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
        naming?: {
            models?: NameDecoration;
        };
    };
}

/** Per-client runtime configuration consumed by the generated provider functions. */
export interface NgOpenapiClientConfig {
    /** Unique identifier for this client (matches GeneratorConfig.clientName). */
    clientName: string;
    basePath: string;
    enableDateTransform?: boolean;
    interceptors?: (new (...args: HttpInterceptor[]) => HttpInterceptor)[]; // Array of interceptor classes
}
