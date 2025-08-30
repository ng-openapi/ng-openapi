import { GeneratorConfig, RequestBody } from "../../types";
import { getTypeScriptType } from "../type.utils";

export function getRequestBodyType(requestBody: RequestBody, config: GeneratorConfig): string {
    const content = requestBody.content || {};
    const jsonContent = content["application/json"];

    if (jsonContent?.schema) {
        return getTypeScriptType(jsonContent.schema, config, jsonContent.schema.nullable);
    }

    return "any";
}