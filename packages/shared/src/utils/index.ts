// String casing
export {
    camelCase,
    capitalizeFirst,
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
    clientNameIdentifier,
    effectiveClientName,
    getClientContextTokenName,
    getInterceptorsTokenName,
    getModelTypeName,
    assertDistinctMemberNames,
    getOperationMethodName,
    RESERVED_MEMBER_NAMES,
    reservedMemberCollision,
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
    RESOURCE_ARGUMENT_PROFILE,
    resolveArgumentNames,
    SERVICE_ARGUMENT_PROFILE,
} from "./functions";
export type { ArgumentNameProfile, ArgumentNames, RenamedArgument, ResponseTypeInfo } from "./functions";
