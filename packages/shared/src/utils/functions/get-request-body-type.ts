import { RequestBody, TypeMappingConfig } from "../../types";
import { getTypeScriptType } from "../type.utils";
import { CONTENT_TYPES } from "../content-types.constants";

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
