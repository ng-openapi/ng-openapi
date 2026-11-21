export {
    emitDocs,
    emitObjectKey,
    emitPropertyName,
    escapeDoubleQuoted,
    escapeJsDoc,
    escapeSingleQuoted,
    escapeTemplateLiteral,
    quoteLiteral,
} from "./literal.emit";
export { defaultContentType, emitDefaultHeadersMerge, emitHeaders } from "./headers.emit";
export type { BodyContentTypeFacts, DefaultHeadersMergeOptions, HeadersEmitOptions } from "./headers.emit";
export { emitMultipartFormData, emitUrlEncodedFormBody } from "./form-body.emit";
export type { FormBodyEmitOptions } from "./form-body.emit";
export { emitQueryParams, emitSignalAwareQueryParams } from "./query-params.emit";
export { emitServiceDecorator } from "./service-decorator.emit";
export type { ServiceDecoratorEmit, ServiceDecoratorEmitOptions } from "./service-decorator.emit";
export { emitResponseTypeOption, joinRequestOptionEntries } from "./response-type.emit";
export { emitUrlConstruction, emitUrlExpression, plainParamValue, signalAwareParamValue } from "./url.emit";
export { emitJsonFile, emitTextFile } from "./text-file.emit";
