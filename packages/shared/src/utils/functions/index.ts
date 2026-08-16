// Public API of the helper functions. Explicit exports only — anything not
// listed here is internal and free to refactor.
export { getBasePathTokenName, getClientContextTokenName, getInterceptorsTokenName } from "./token-names";
export { getModelTypeName, getResourceClassName, getServiceClassName } from "./class-names";
export {
    deriveLocalName,
    RESOURCE_RESERVED_ARGUMENT_NAMES,
    resolveArgumentNames,
    SERVICE_RESERVED_ARGUMENT_NAMES,
} from "./argument-names";
export type { ArgumentNames, RenamedArgument } from "./argument-names";
export { groupOperationsByController } from "./controller-groups";
export { getOperationMethodName } from "./method-names";
export { hasDuplicateFunctionNames } from "./duplicate-function-name";
export { extractPaths } from "./extract-paths";
export {
    getResponseInfoFromResponse,
    getResponseType,
    getResponseTypeFromResponse,
    inferResponseTypeFromContentType,
    isPrimitiveType,
} from "./extract-swagger-response-type";
export type { ResponseTypeInfo } from "./extract-swagger-response-type";
export { getRequestBodyType } from "./get-request-body-type";
export { isDataTypeInterface } from "./is-data-type-interface";
export { generateParseRequestTypeParams } from "./generate-parse-request-type-params";
export { isUrl } from "./is-url";
