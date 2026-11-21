import { RequestBody, TypeMappingConfig } from "../../types";
import type { NormalizedOperation } from "../../model/operation.model";
import { getTypeScriptType } from "../type.utils";
import { CONTENT_TYPES } from "../content-types.constants";

/**
 * TS type of the single argument an operation's body is passed as: the
 * schema's type for a JSON body, `string` for a text one and `Blob` for a
 * binary one — what `HttpClient` sends untouched. Undefined when the body is
 * not one argument: a form, bound field by field, or no bound body at all.
 */
export function getBodyArgumentType(
    operation: Pick<NormalizedOperation, "requestBody" | "bodyKind" | "bodyContentType">,
    config: TypeMappingConfig,
): string | undefined {
    switch (operation.bodyKind) {
        case "json": {
            const schema = operation.requestBody?.content?.[operation.bodyContentType ?? CONTENT_TYPES.JSON]?.schema;
            return schema ? getTypeScriptType(schema, config, schema.nullable) : "any";
        }
        case "text":
            return "string";
        case "binary":
            return "Blob";
        default:
            return undefined;
    }
}

/**
 * TS type of an operation's JSON request body; `"any"` when the body has no
 * JSON content or no schema. Multipart/urlencoded bodies are handled
 * separately by the method-body emission.
 */
export function getRequestBodyType(requestBody: RequestBody, config: TypeMappingConfig): string {
    const content = requestBody.content || {};
    const jsonContent = content[CONTENT_TYPES.JSON];

    if (jsonContent?.schema) {
        return getTypeScriptType(jsonContent.schema, config, jsonContent.schema.nullable);
    }

    return "any";
}
