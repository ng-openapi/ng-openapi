import {
    BodyParameter,
    ExternalDocs,
    Info,
    ParameterType,
    Path,
    QueryParameter,
    Security,
    Tag,
    XML,
} from "swagger-schema-official";

/**
 * An operation parameter. OpenAPI 3.x carries the type in `schema`;
 * Swagger 2.0 puts `type`/`format` directly on the parameter — consumers
 * must handle both (or use the normalized model, which precomputes them).
 */
export interface Parameter {
    name: string;
    in: "query" | "path" | "header" | "cookie";
    required?: boolean;
    schema?: SwaggerDefinition;
    type?: string;
    format?: string;
    description?: string;
}

/**
 * One operation of the spec, flattened to (path, method). Raw-ish view —
 * generators consume its precomputed extension NormalizedOperation instead.
 */
export interface PathInfo {
    path: string;
    method: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses?: Record<string, SwaggerResponse>;
}

/** Operation request body, keyed by content type (normalizer maps 2.0 body params into this shape). */
export interface RequestBody {
    required?: boolean;
    content?: Record<string, { schema?: SwaggerDefinition }>;
}

/** A single response entry, keyed by content type (normalizer maps 2.0 `schema` into `content`). */
export interface SwaggerResponse {
    description?: string;
    content?: Record<string, { schema?: SwaggerDefinition }>;
}

/** OpenAPI 3.x security scheme (subset of the spec's fields). */
export interface OpenApiSecurityScheme {
    type?: "apiKey" | "http" | "oauth2" | "openIdConnect";
    description?: string;
    name?: string;
    in?: "query" | "header" | "cookie";
    scheme?: string;
    bearerFormat?: string;
    flows?: Record<string, unknown>;
    openIdConnectUrl?: string;
}

/**
 * A JSON-Schema-ish definition as it appears in the spec, shared by
 * Swagger 2.0 and OpenAPI 3.x (3.0's `nullable` and 3.1's type arrays
 * both flow through `type`/`nullable`). May contain unresolved `$ref`s.
 */
export interface SwaggerDefinition {
    type?: ParameterType | undefined;
    format?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    default?: unknown;
    multipleOf?: number | undefined;
    maximum?: number | undefined;
    exclusiveMaximum?: boolean | undefined;
    minimum?: number | undefined;
    exclusiveMinimum?: boolean | undefined;
    maxLength?: number | undefined;
    minLength?: number | undefined;
    pattern?: string | undefined;
    maxItems?: number | undefined;
    minItems?: number | undefined;
    uniqueItems?: boolean | undefined;
    maxProperties?: number | undefined;
    minProperties?: number | undefined;
    enum?: Array<string | number> | undefined;
    /** OpenAPI 3.1 (JSON Schema); normalizeSchema folds it into a single-value `enum`. */
    const?: unknown;
    items?: SwaggerDefinition | SwaggerDefinition[] | undefined;
    $ref?: string | undefined;
    allOf?: SwaggerDefinition[] | undefined;
    additionalProperties?: SwaggerDefinition | boolean | undefined;
    properties?: { [propertyName: string]: SwaggerDefinition } | undefined;
    discriminator?: string | undefined;
    readOnly?: boolean | undefined;
    nullable?: boolean | undefined;
    xml?: XML | undefined;
    externalDocs?: ExternalDocs | undefined;
    example?: unknown;
    required?: string[] | undefined;
    oneOf?: SwaggerDefinition[];
    anyOf?: SwaggerDefinition[];
}

/**
 * The raw parsed spec document. Exactly one of `swagger` ("2.x") or
 * `openapi` ("3.x") identifies the version; everything version-specific
 * is resolved once by normalizeSpec.
 */
export interface SwaggerSpec {
    openapi: string;
    swagger: string;
    info: Info;
    externalDocs?: ExternalDocs | undefined;
    host?: string | undefined;
    basePath?: string | undefined;
    schemes?: string[] | undefined;
    consumes?: string[] | undefined;
    produces?: string[] | undefined;
    paths: { [pathName: string]: Path };
    definitions?: { [definitionsName: string]: SwaggerDefinition } | undefined;
    parameters?: { [parameterName: string]: BodyParameter | QueryParameter } | undefined;
    responses?: { [responseName: string]: SwaggerResponse } | undefined;
    security?: Array<{ [securityDefinitionName: string]: string[] }> | undefined;
    securityDefinitions?: { [securityDefinitionName: string]: Security } | undefined;
    tags?: Tag[] | undefined;
    components?: {
        schemas?: Record<string, SwaggerDefinition>;
        securitySchemes?: Record<string, OpenApiSecurityScheme | Security>;
    };
}

/**
 * Shape of a JSON-encoded enum description consumed when
 * `generateEnumBasedOnDescription` is enabled: the description holds
 * `[{"Name":"First","Value":1}, …]` and supplies the member names.
 */
export type EnumValueObject = {
    Name: string;
    Value: number;
};
