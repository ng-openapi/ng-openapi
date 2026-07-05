// OpenAPI/Swagger spec shapes
export type {
    EnumValueObject,
    OpenApiSecurityScheme,
    Parameter,
    PathInfo,
    RequestBody,
    SwaggerDefinition,
    SwaggerResponse,
    SwaggerSpec,
} from "./swagger.types";
// User-facing generator configuration + segregated per-generator views
export type {
    GeneratorConfig,
    MethodGenOptions,
    NgOpenapiClientConfig,
    TypeGenOptions,
    TypeMappingConfig,
} from "./config.types";
// Method-generation contexts and loose schema shape
export type { GetMethodGenerationContext, MethodGenerationContext, TypeSchema } from "./generator.types";
// Plugin contract
export type { IPluginGenerator, IPluginGeneratorClass } from "./plugin.types";
