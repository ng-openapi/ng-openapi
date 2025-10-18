import { GeneratorConfig, RequestBody } from "../../types";
import { getTypeScriptType } from "../type.utils";
import { CONTENT_TYPES } from "../content-types.constants";

export function getRequestBodyType(requestBody: RequestBody, config: GeneratorConfig): string {
    const content = requestBody.content || {};
    const jsonContent = content[CONTENT_TYPES.JSON];

    if (jsonContent?.schema) {
        // --- CORE FIX ---
        // We can only access '.nullable' if the schema is a full SwaggerDefinition,
        // not a reference object ({ $ref: '...' }).
        // We use a type guard to check for the absence of '$ref'.
        const isNullable = !('$ref' in jsonContent.schema) ? jsonContent.schema.nullable : undefined;

        return getTypeScriptType(jsonContent.schema, config, isNullable);
    }

    return "any";
}
