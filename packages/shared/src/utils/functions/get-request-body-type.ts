import { RequestBody, TypeMappingConfig } from "../../types";
import type { NormalizedOperation, NormalizedQueryString } from "../../model/operation.model";
import { getTypeScriptType } from "../type.utils";
import { CONTENT_TYPES } from "../content-types.constants";
import { isJsonMediaType, isMediaTypeRange } from "./media-types";

/**
 * TS type of the single argument an operation's body is passed as: the
 * schema's type for a JSON body, `string` for a text one and `Blob` for a
 * binary one — what `HttpClient` sends untouched. Undefined when the body is
 * not one argument: a form, bound field by field, or no bound body at all.
 */
export function getBodyArgumentType(
    operation: Pick<NormalizedOperation, "requestBody" | "bodyKind" | "bodyContentKey">,
    config: TypeMappingConfig,
): string | undefined {
    switch (operation.bodyKind) {
        case "json": {
            const schema = operation.requestBody?.content?.[operation.bodyContentKey ?? CONTENT_TYPES.JSON]?.schema;
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
 * TS type of the argument that is sent as the whole query string: the
 * schema's type for a JSON one, `string` for a text one.
 */
export function getQueryStringArgumentType(queryString: NormalizedQueryString, config: TypeMappingConfig): string {
    if (queryString.kind === "text") {
        return "string";
    }
    return queryString.schema ? getTypeScriptType(queryString.schema, config, queryString.schema.nullable) : "any";
}

/**
 * TS type of the JSON document a request body declares: the one under
 * `application/json` when it is declared exactly so, otherwise under the
 * first JSON content key (`application/merge-patch+json`,
 * `application/json; charset=utf-8`). `"any"` when it declares none, or one
 * without a schema.
 *
 * This reads a declaration, not an operation. Which body a generated method
 * sends — a form declared next to the JSON, a body under `*`/`*` typed by
 * its schema — is the operation's `bodyKind`, and `getBodyArgumentType`
 * answers for that body. Prefer it wherever there is an operation to ask.
 */
export function getRequestBodyType(requestBody: RequestBody, config: TypeMappingConfig): string {
    const content = requestBody.content || {};
    const jsonContent =
        content[CONTENT_TYPES.JSON] ??
        content[
            Object.keys(content).find(
                (contentType) => isJsonMediaType(contentType) && !isMediaTypeRange(contentType),
            ) ?? CONTENT_TYPES.JSON
        ];

    if (jsonContent?.schema) {
        return getTypeScriptType(jsonContent.schema, config, jsonContent.schema.nullable);
    }

    return "any";
}
