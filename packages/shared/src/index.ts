/**
 * Public API of @ng-openapi/shared.
 *
 * Every sub-barrel exports an explicit, curated symbol list — anything not
 * re-exported here is internal to the package and free to change without
 * notice (REFACTORING_PLAN.md phase 1.3).
 */

// Spec shapes, generator config, plugin contract
export type {
    EnumValueObject,
    GeneratorConfig,
    GetMethodGenerationContext,
    IPluginGenerator,
    IPluginGeneratorClass,
    MethodGenerationContext,
    MethodGenOptions,
    NgOpenapiClientConfig,
    OpenApiSecurityScheme,
    Parameter,
    PathInfo,
    PluginGeneratorContext,
    RequestBody,
    SwaggerDefinition,
    SwaggerResponse,
    SwaggerSpec,
    TypeGenOptions,
    TypeMappingConfig,
    TypeSchema,
} from "./types";

// Normalized spec model (version-free view consumed by generators)
export type { NormalizedOperation, NormalizedSpec, ResponseKind, SpecVersion } from "./model";

// Spec loading and access
export { normalizeSpec, SwaggerParser } from "./core";

// Emission helpers (method-body fragments shared by core + plugins)
export {
    emitDefaultHeadersMerge,
    emitHeaders,
    emitQueryParams,
    emitResponseTypeOption,
    emitSignalAwareQueryParams,
    emitUrlConstruction,
    emitUrlExpression,
    joinRequestOptionEntries,
    plainParamValue,
    signalAwareParamValue,
} from "./emit";
export type { HeadersEmitOptions } from "./emit";

// Utilities
export {
    camelCase,
    CONTENT_TYPES,
    escapeString,
    extractPaths,
    generateParseRequestTypeParams,
    getBasePathTokenName,
    getClientContextTokenName,
    getInterceptorsTokenName,
    getRequestBodyType,
    getResponseType,
    getResponseTypeFromResponse,
    getTypeScriptType,
    hasDuplicateFunctionNames,
    inferResponseTypeFromContentType,
    isDataTypeInterface,
    isPrimitiveType,
    isUrl,
    kebabCase,
    nullableType,
    pascalCase,
    pascalCaseForEnums,
    screamingSnakeCase,
} from "./utils";

// Generated-file header comments
export {
    BASE_INTERCEPTOR_HEADER_COMMENT,
    HTTP_RESOURCE_GENERATOR_HEADER_COMMENT,
    MAIN_INDEX_GENERATOR_HEADER_COMMENT,
    PROVIDER_GENERATOR_HEADER_COMMENT,
    REQUEST_PARAMS_GENERATOR_HEADER_COMMENT,
    SERVICE_GENERATOR_HEADER_COMMENT,
    SERVICE_INDEX_GENERATOR_HEADER_COMMENT,
    TYPE_GENERATOR_HEADER_COMMENT,
    ZOD_PLUGIN_GENERATOR_HEADER_COMMENT,
    ZOD_PLUGIN_INDEX_GENERATOR_HEADER_COMMENT,
} from "./config";
