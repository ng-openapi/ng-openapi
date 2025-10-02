import { GeneratorConfig, RequestBody } from "../../types";
import { getTypeScriptType } from "../type.utils";
import { CONTENT_TYPES } from "../content-types.constants";

export function getRequestBodyType(requestBody: RequestBody, config: GeneratorConfig): string {
    const content = requestBody.content || {};
    const jsonContent = content[CONTENT_TYPES.JSON];

    if (jsonContent?.schema) {
        return getTypeScriptType(jsonContent.schema, config, jsonContent.schema.nullable);
    }

    return "any";
}
