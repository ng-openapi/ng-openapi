// String casing
export {
    camelCase,
    isValidIdentifier,
    kebabCase,
    pascalCase,
    pascalCaseForEnums,
    screamingSnakeCase,
} from "./string.utils";
// Swagger/OpenAPI → TypeScript type mapping
export { escapeString, getTypeScriptType, nullableType } from "./type.utils";
// Content-type constants
export { CONTENT_TYPES } from "./content-types.constants";
// ts-morph Project queries
export { listGeneratedBarrelDirs, listGeneratedFileNames } from "./project.utils";
// Helper functions (path extraction, response typing, token names, ...)
export {
    extractPaths,
    generateParseRequestTypeParams,
    getBasePathTokenName,
    getClientContextTokenName,
    getInterceptorsTokenName,
    getModelTypeName,
    getOperationMethodName,
    getRequestBodyType,
    getResourceClassName,
    getServiceClassName,
    getResponseInfoFromResponse,
    getResponseType,
    getResponseTypeFromResponse,
    groupOperationsByController,
    hasDuplicateFunctionNames,
    inferResponseTypeFromContentType,
    isDataTypeInterface,
    isPrimitiveType,
    isUrl,
    RESOURCE_RESERVED_ARGUMENT_NAMES,
    resolveArgumentNames,
    SERVICE_RESERVED_ARGUMENT_NAMES,
} from "./functions";
export type { ArgumentNames, RenamedArgument, ResponseTypeInfo } from "./functions";
