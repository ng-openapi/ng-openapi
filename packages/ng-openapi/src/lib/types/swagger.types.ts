import {
    BodyParameter,
    ExternalDocs,
    Info,
    ParameterType,
    Path,
    QueryParameter,
    Security,
    Tag,
    XML
} from "swagger-schema-official";

export interface Parameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    required?: boolean;
    schema?: any;
    type?: string;
    format?: string;
    description?: string;
}

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

export interface RequestBody {
    required?: boolean;
    content?: Record<string, { schema?: SwaggerDefinition }>;
}

export interface SwaggerResponse {
    description?: string;
    content?: Record<string, { schema?: any }>;
}

export interface SwaggerDefinition {
    type?: ParameterType | undefined;
    format?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    default?: any;
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
    enum?: any[] | undefined;
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
    example?: any;
    required?: string[] | undefined;
    oneOf?: SwaggerDefinition[];
    anyOf?: SwaggerDefinition[];
}

export interface SwaggerSpec {
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
    }
}

export type EnumValueObject = {
    Name: string;
    Value: number
};