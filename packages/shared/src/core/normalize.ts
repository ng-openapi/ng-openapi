// Concrete-module imports (not barrels) to keep the core <-> types/utils
// import graph cycle-free — see swagger-parser.ts for the same rule.
import { CONTENT_TYPES } from "../utils/content-types.constants";
import { describeOperation } from "../errors";
import { createComponentResolvers } from "../utils/functions/component-resolver";
import { extractPaths } from "../utils/functions/extract-paths";
import { getResponseInfoFromResponse } from "../utils/functions/extract-swagger-response-type";
import { bodyMediaFamily, isMediaTypeRange, mediaTypeEssence } from "../utils/functions/media-types";
import type { ResponseTypeInfo } from "../utils/functions/extract-swagger-response-type";
import { resolveEnumMemberNames } from "./enum-member-names";
import type { EnumNamingOptions } from "../types/config.types";
import type { Parameter, PathInfo, RequestBody, SwaggerDefinition, SwaggerSpec } from "../types/swagger.types";
import type { NormalizedOperation, NormalizedQueryString, RequestBodyKind } from "../model/operation.model";
import type { NormalizedSpec } from "../model/spec.model";

type ResolveRef = (ref: string) => SwaggerDefinition | undefined;

/**
 * Normalizes a parsed spec into the version-free model the generators consume.
 * Everything here used to be re-derived per generator (service-method body,
 * http-resource body, overloads) — computing it once keeps the derivations
 * identical by construction.
 */
export function normalizeSpec(
    spec: SwaggerSpec,
    onWarning?: (message: string) => void,
    enumNaming: EnumNamingOptions = { options: {} },
): NormalizedSpec {
    const rawDefinitions = spec.definitions || spec.components?.schemas || {};
    const definitions = Object.fromEntries(
        Object.entries(rawDefinitions).map(([name, definition]) => [
            name,
            nameEnumMembers(name, normalizeSchema(definition), enumNaming, onWarning),
        ]),
    );
    const resolveReference: ResolveRef = (ref) => {
        const parts = ref.split("/");
        const name = parts[parts.length - 1];
        // Own properties only: `.../constructor` must not "resolve" to Object.
        return Object.prototype.hasOwnProperty.call(definitions, name) ? definitions[name] : undefined;
    };

    return {
        version: spec.swagger
            ? { type: "swagger", version: spec.swagger }
            : spec.openapi
              ? { type: "openapi", version: spec.openapi }
              : null,
        info: spec.info
            ? {
                  title: infoText(spec.info.title),
                  version: infoText(spec.info.version),
                  description: infoText(spec.info.description),
              }
            : undefined,
        definitions,
        operations: extractPaths(spec.paths, undefined, onWarning, createComponentResolvers(spec)).map((operation) =>
            normalizeOperation(normalizeOperationSchemas(operation), resolveReference, onWarning),
        ),
        resolveReference,
    };
}

/**
 * Attaches `enumMemberNames` to a top-level definition. Only these become
 * named enums — an inline property enum is emitted as a literal union and has
 * no members to name — so nested schemas are deliberately not visited.
 *
 * Updates `definition` in place: it is the copy `normalizeSchema` just made.
 * The field is cleared first: it is normalizer-owned, and a spec that happens
 * to carry a key of that name must not reach the enum builder unvalidated.
 */
function nameEnumMembers(
    name: string,
    definition: SwaggerDefinition,
    enumNaming: EnumNamingOptions,
    onWarning?: (message: string) => void,
): SwaggerDefinition {
    delete definition.enumMemberNames;
    const names = resolveEnumMemberNames(name, definition, enumNaming, onWarning);
    if (names) {
        definition.enumMemberNames = names;
    }
    return definition;
}

/**
 * `info` fields are typed as strings but arrive as whatever the author wrote:
 * an unquoted YAML `version: 1.0` parses as the number 1, and an object or
 * array is nothing a README or package.json could show. Coerced silently —
 * nothing reads `info` unless the `package` option is set, and the scaffold
 * warns at the point of use, so a spec defect never nags a user it does not
 * affect.
 */
function infoText(value: unknown): string | undefined {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return undefined;
}

/**
 * Normalizes the JSON-Schema constructs OpenAPI 3.1 introduced so generators
 * never see them:
 *
 * - type arrays: `"null"` members fold into `nullable: true`, and a single
 *   remaining type collapses to a plain string type — so `format`, `enum` and
 *   friends keep working on nullable 3.1 schemas.
 * - `const` becomes a single-value `enum`.
 *
 * Returns a deep copy; the raw spec is never mutated. Schemas without 3.1
 * constructs come back semantically identical.
 */
export function normalizeSchema(schema: SwaggerDefinition): SwaggerDefinition {
    const normalized: SwaggerDefinition = { ...schema };

    // SwaggerDefinition types `type` as a single string; raw 3.1 documents may
    // carry an array — read it untyped and normalize it away right here.
    const rawType: unknown = normalized.type;
    if (Array.isArray(rawType)) {
        const types = rawType.filter((t) => t !== "null");
        if (types.length < rawType.length) {
            normalized.nullable = true;
        }
        // Multi-type arrays (rare) stay arrays for the resolvers' union path
        normalized.type = (types.length === 1 ? types[0] : types.length === 0 ? "null" : types) as typeof schema.type;
    }

    if (normalized.const !== undefined && !normalized.enum) {
        const constType = typeof normalized.const;
        if (constType === "string" || constType === "number") {
            normalized.enum = [normalized.const as string | number];
            // A bare `const` carries its type implicitly — make it explicit so
            // schema-typed consumers (zod plugin) don't fall back to `any`.
            if (normalized.type === undefined) {
                normalized.type = constType as typeof schema.type;
            }
            delete normalized.const;
        } else if (constType === "boolean") {
            // Not folded into enum: a boolean enum member would emit invalid
            // TS for enum-style definitions. Plain boolean is safe everywhere.
            if (normalized.type === undefined) {
                normalized.type = "boolean" as typeof schema.type;
            }
            delete normalized.const;
        }
        // Object/array/null consts are left untouched: folding them into enum
        // would render String(value) garbage like "[object Object]" as a type.
        // Generators ignore the unknown keyword and fall back to their untyped
        // rendering, exactly as before 3.1 support.
    }

    if (normalized.properties) {
        normalized.properties = Object.fromEntries(
            Object.entries(normalized.properties).map(([name, property]) => [name, normalizeSchema(property)]),
        );
    }
    if (normalized.items) {
        normalized.items = Array.isArray(normalized.items)
            ? normalized.items.map(normalizeSchema)
            : normalizeSchema(normalized.items);
    }
    if (typeof normalized.additionalProperties === "object") {
        normalized.additionalProperties = normalizeSchema(normalized.additionalProperties);
    }
    if (normalized.allOf) {
        normalized.allOf = normalized.allOf.map(normalizeSchema);
    }
    if (normalized.oneOf) {
        normalized.oneOf = normalized.oneOf.map(normalizeSchema);
    }
    if (normalized.anyOf) {
        normalized.anyOf = normalized.anyOf.map(normalizeSchema);
    }

    return normalized;
}

/** Applies normalizeSchema to every schema an operation carries (params, body, responses). */
function normalizeOperationSchemas(operation: PathInfo): PathInfo {
    return {
        ...operation,
        parameters: operation.parameters?.map((parameter) => ({
            ...parameter,
            ...(parameter.schema ? { schema: normalizeSchema(parameter.schema) } : {}),
            ...(parameter.content ? { content: normalizeContentSchemas(parameter.content) } : {}),
        })),
        requestBody: operation.requestBody
            ? { ...operation.requestBody, content: normalizeContentSchemas(operation.requestBody.content) }
            : operation.requestBody,
        responses: operation.responses
            ? Object.fromEntries(
                  Object.entries(operation.responses).map(([status, response]) => [
                      status,
                      { ...response, content: normalizeContentSchemas(response.content) },
                  ]),
              )
            : operation.responses,
    };
}

function normalizeContentSchemas(
    content: Record<string, { schema?: SwaggerDefinition }> | undefined,
): Record<string, { schema?: SwaggerDefinition }> | undefined {
    if (!content) return content;
    return Object.fromEntries(
        Object.entries(content).map(([contentType, mediaType]) => [
            contentType,
            mediaType?.schema ? { ...mediaType, schema: normalizeSchema(mediaType.schema) } : mediaType,
        ]),
    );
}

function normalizeOperation(
    rawOperation: PathInfo,
    resolveRef: ResolveRef,
    onWarning?: (message: string) => void,
): NormalizedOperation {
    warnAboutUnboundParameters(rawOperation, onWarning);
    const operation = dropUnsendableRequestBody(rawOperation, onWarning);
    const content = operation.requestBody?.content;
    // A form is a form whatever parameters its content key carries
    // (`application/x-www-form-urlencoded; charset=UTF-8`): it is found by
    // what the media type is, and its schema read under the key as written.
    const multipartKey = contentKeyOf(content, CONTENT_TYPES.MULTIPART);
    const urlEncodedKey = contentKeyOf(content, CONTENT_TYPES.FORM_URLENCODED);
    const isMultipart = multipartKey !== undefined;
    const isUrlEncoded = urlEncodedKey !== undefined && !content?.[CONTENT_TYPES.JSON];

    const formDataSchema =
        multipartKey !== undefined ? resolveBodySchema(operation.requestBody, multipartKey, resolveRef) : undefined;
    const urlEncodedSchema =
        isUrlEncoded && urlEncodedKey !== undefined
            ? resolveBodySchema(operation.requestBody, urlEncodedKey, resolveRef)
            : undefined;

    const responseInfo = determineResponseInfo(operation);

    const pathParams = operation.parameters?.filter((p) => p.in === "path") || [];
    const declaredQueryParams = operation.parameters?.filter((p) => p.in === "query") || [];
    const queryString = resolveQueryString(operation, declaredQueryParams, resolveRef, onWarning);
    const queryParams = [...declaredQueryParams, ...queryString.params];
    const formDataFields = Object.keys(formDataSchema?.properties || {});
    const urlEncodedFields = Object.keys(urlEncodedSchema?.properties || {});
    if (isMultipart && formDataFields.length === 0) {
        warnAboutFieldlessFormBody(operation, CONTENT_TYPES.MULTIPART, onWarning);
    }
    if (isUrlEncoded && urlEncodedFields.length === 0) {
        warnAboutFieldlessFormBody(operation, CONTENT_TYPES.FORM_URLENCODED, onWarning);
    }
    // The content key, not `isUrlEncoded`: that flag, and `urlEncodedFields`
    // with it, is off whenever a JSON alternative is declared too, and the
    // fields of the urlencoded form are just as unsent then.
    if (isMultipart && urlEncodedKey !== undefined) {
        const declared = resolveBodySchema(operation.requestBody, urlEncodedKey, resolveRef);
        warnAboutUnsentFormFields(operation, formDataFields, Object.keys(declared?.properties || {}), onWarning);
    }
    const body = boundBody(
        content,
        isMultipart,
        isUrlEncoded ? urlEncodedKey : undefined,
        formDataFields,
        urlEncodedFields,
    );
    if (operation.requestBody && !isMultipart && !isUrlEncoded && !body) {
        warnAboutUnboundBody(operation, onWarning);
    }

    return {
        ...operation,
        pathParams,
        queryParams,
        queryString: queryString.whole,
        hasBody: !!operation.requestBody,
        bodyKind: body?.kind,
        bodyContentType: body?.contentType,
        isMultipart,
        isUrlEncoded,
        formDataSchema,
        formDataFields,
        urlEncodedSchema,
        urlEncodedFields,
        responseType: responseInfo.responseType,
        acceptHeader: responseInfo.acceptHeader,
    };
}

/**
 * What an operation's `in: querystring` parameter (OpenAPI 3.2) contributes.
 * The parameter is the entire query string, described by one media type:
 *
 * - `application/x-www-form-urlencoded` with an object schema is a list of
 *   `key=value` pairs, which is exactly what query parameters are. Its
 *   top-level properties come back as `params` and are generated as ordinary
 *   query parameters — one argument each, like the fields of a form body.
 * - A JSON or text media type is one value whose serialization is the whole
 *   query string. It comes back as `whole`.
 *
 * A property is required only when the parameter is: a querystring parameter
 * that is not required may be left out entirely, and with one argument per
 * property that is only expressible by making each of them optional.
 *
 * Anything that cannot be generated is skipped with a warning that says what
 * the client then sends: no query string from it.
 */
function resolveQueryString(
    operation: PathInfo,
    declaredQueryParams: readonly Parameter[],
    resolveRef: ResolveRef,
    onWarning?: (message: string) => void,
): { params: Parameter[]; whole?: NormalizedQueryString } {
    const declared = (operation.parameters ?? []).filter((p) => p.in === "querystring");
    if (declared.length === 0) {
        return { params: [] };
    }
    const [parameter, ...others] = declared;
    const described = describeOperation(operation);
    const subject = `\`in: querystring\` parameter "${parameter.name}" of ${described}`;
    const skipped = (reason: string): { params: Parameter[] } => {
        onWarning?.(`${subject} was skipped: ${reason} Generated methods take no argument for it.`);
        return { params: [] };
    };
    if (others.length > 0) {
        onWarning?.(
            `${described} declares ${declared.length} \`in: querystring\` parameters, and a request has one query ` +
                `string. "${parameter.name}" is generated; ${others.map((p) => `"${p.name}"`).join(", ")} ` +
                `${others.length === 1 ? "is" : "are"} skipped.`,
        );
    }

    const media = Object.entries(parameter.content ?? {});
    if (media.length === 0) {
        return skipped(
            "it declares no `content`. A querystring parameter is described by one media type under `content`, " +
                "not by `schema`.",
        );
    }
    const [contentType, mediaType] = media[0];

    if (mediaTypeEssence(contentType) === CONTENT_TYPES.FORM_URLENCODED) {
        const schema = mediaType?.schema?.$ref ? resolveRef(mediaType.schema.$ref) : mediaType?.schema;
        const properties = Object.entries(schema?.properties ?? {});
        if (properties.length === 0) {
            return skipped(
                "its form schema lists no top-level `properties` to send as `key=value` pairs (`allOf`, " +
                    "`additionalProperties` and free-form objects are not expanded).",
            );
        }
        const required = new Set(parameter.required ? (schema?.required ?? []) : []);
        // A property an `in: query` parameter already sends is sent once.
        const taken = new Set(declaredQueryParams.map((p) => p.name));
        return {
            params: properties
                .filter(([name]) => !taken.has(name))
                .map(([name, propertySchema]) => ({
                    name,
                    in: "query" as const,
                    required: required.has(name),
                    schema: propertySchema,
                    description: propertySchema.description,
                })),
        };
    }

    const family = bodyMediaFamily(contentType);
    if (family !== "json" && family !== "text") {
        return skipped(
            `its content type ${contentType} is not one a query string is generated from. ` +
                `${CONTENT_TYPES.FORM_URLENCODED}, JSON and text content types are.`,
        );
    }
    if (declaredQueryParams.length > 0) {
        return skipped(
            `the operation also declares \`in: query\` parameters ` +
                `(${declaredQueryParams.map((p) => `"${p.name}"`).join(", ")}), which OpenAPI does not allow next ` +
                "to it: its value is the entire query string, so there is nowhere to put them.",
        );
    }
    return {
        params: [],
        whole: {
            name: parameter.name,
            kind: family,
            required: !!parameter.required,
            schema: family === "json" ? mediaType?.schema : undefined,
            description: parameter.description,
        },
    };
}

/**
 * The key `content` declares a media type under: `essence` itself when it is
 * a key, otherwise the first key that is that media type with parameters.
 * The exact key comes first so that a spec declaring both keeps the one that
 * was always read.
 */
function contentKeyOf(content: RequestBody["content"] | undefined, essence: string): string | undefined {
    if (!content) {
        return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(content, essence)) {
        return essence;
    }
    return Object.keys(content).find((contentType) => mediaTypeEssence(contentType) === essence);
}

/**
 * Which body the generated request carries, and the content key it is
 * declared under. One body is sent, so a body declared several ways resolves
 * to one of them, in this order:
 *
 * 1. `multipart/form-data`, then `application/x-www-form-urlencoded` unless
 *    `application/json` is declared too (`isUrlEncoded` already means it is
 *    not). A form is sent field by field, so one without fields sends
 *    nothing — and nothing else is tried in its place.
 * 2. `application/json`, exactly.
 * 3. Any other content type a method can send, a JSON one before a text one
 *    before a binary one, in declaration order within each.
 *
 * The first two are the bindings there have always been; the third only
 * applies where nothing was bound before.
 *
 * `contentType` is what the request declares. A string has no type of its
 * own, so a text body declares the first concrete one the spec lists. A Blob
 * does: a binary body declares the spec's type only when the spec leaves no
 * choice — one concrete type — and otherwise the Blob's.
 */
function boundBody(
    content: RequestBody["content"] | undefined,
    isMultipart: boolean,
    /** The content key of the urlencoded form, when that is the form the operation sends. */
    urlEncodedKey: string | undefined,
    formDataFields: readonly string[],
    urlEncodedFields: readonly string[],
): { kind: RequestBodyKind; contentType?: string } | undefined {
    if (isMultipart) {
        return formDataFields.length > 0 ? { kind: "multipart" } : undefined;
    }
    if (urlEncodedKey !== undefined) {
        return urlEncodedFields.length > 0 ? { kind: "urlencoded", contentType: urlEncodedKey } : undefined;
    }
    if (content?.[CONTENT_TYPES.JSON]) {
        return { kind: "json", contentType: CONTENT_TYPES.JSON };
    }
    const declared = Object.keys(content ?? {});
    for (const family of ["json", "text", "binary"] as const) {
        const candidates = declared.filter((candidate) => bodyMediaFamily(candidate) === family);
        if (candidates.length === 0) {
            continue;
        }
        const concrete = candidates.filter((candidate) => !isMediaTypeRange(candidate));
        const unambiguous = family !== "binary" || candidates.length === 1;
        return { kind: family, contentType: unambiguous ? concrete[0] : undefined };
    }
    return undefined;
}

/**
 * Methods a browser never sends a body with: `fetch` rejects a GET or HEAD
 * request that carries one, and XMLHttpRequest discards it. Every other
 * method — DELETE and OPTIONS included — transmits the body it is given.
 */
const METHODS_WITHOUT_BODY: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/**
 * Leaves a request body the client could never deliver out of the IR, out
 * loud. Carrying it would give the method a body argument and a Content-Type
 * header for a body that is not sent: a call that type-checks and reaches
 * the server empty (#138).
 */
function dropUnsendableRequestBody(operation: PathInfo, onWarning?: (message: string) => void): PathInfo {
    if (!operation.requestBody || !METHODS_WITHOUT_BODY.has(operation.method.toUpperCase())) {
        return operation;
    }
    onWarning?.(
        `The request body of ${describeOperation(operation)} was skipped: browsers do not send a body with ` +
            `${operation.method.toUpperCase()} requests. Generated methods take no body and no validator is ` +
            "generated for it. Describe the input as query parameters, or use a method that carries a body.",
    );
    return { ...operation, requestBody: undefined };
}

/**
 * A form body is sent field by field, and the fields are the top-level
 * `properties` of its schema — nothing else is expanded. A schema that lists
 * none (`allOf` inheritance, `additionalProperties`, a bare object) leaves the
 * method with no argument to take and no body to send, which the caller only
 * finds out from the server unless it is said here.
 */
function warnAboutFieldlessFormBody(
    operation: PathInfo,
    contentType: string,
    onWarning?: (message: string) => void,
): void {
    onWarning?.(
        `The ${contentType} request body of ${describeOperation(operation)} has no fields to generate: form ` +
            "fields are read from the top-level `properties` of its schema, and it lists none (`allOf`, " +
            "`additionalProperties` and free-form objects are not expanded). Generated methods take no argument " +
            "for it and send the request without a body" +
            (contentType === CONTENT_TYPES.FORM_URLENCODED
                ? `, still with the \`Content-Type: ${contentType}\` header`
                : "") +
            ". List the fields as `properties` of the body schema to have them generated.",
    );
}

/**
 * One body is sent per request, and multipart is the form that is: when an
 * operation declares both forms, the urlencoded one contributes nothing. That
 * is the ordinary shape where both list the same fields (ASP.NET's
 * `[FromForm]` is published this way) and worth no words; a field only the
 * urlencoded form lists, though, is input the generated method has no
 * argument for.
 */
function warnAboutUnsentFormFields(
    operation: PathInfo,
    formDataFields: readonly string[],
    urlEncodedFields: readonly string[],
    onWarning?: (message: string) => void,
): void {
    const sent = new Set(formDataFields);
    const unsent = urlEncodedFields.filter((field) => !sent.has(field));
    if (unsent.length === 0) {
        return;
    }
    onWarning?.(
        `The request body of ${describeOperation(operation)} is declared as both ${CONTENT_TYPES.MULTIPART} and ` +
            `${CONTENT_TYPES.FORM_URLENCODED}. Generated methods send the ${CONTENT_TYPES.MULTIPART} one, so ` +
            `${unsent.length === 1 ? "the field" : "the fields"} ${unsent.map((field) => `"${field}"`).join(", ")}, ` +
            `which only the ${CONTENT_TYPES.FORM_URLENCODED} form lists, ` +
            `${unsent.length === 1 ? "gets no argument and is" : "get no argument and are"} not sent. ` +
            `List ${unsent.length === 1 ? "it" : "them"} in the ${CONTENT_TYPES.MULTIPART} schema too, or declare one form.`,
    );
}

/**
 * A body no generated method can send (see `bodyMediaFamily`): one declared
 * only under a sequential type, which is a stream of items, not one value to
 * pass, or under a `multipart/*` type other than `multipart/form-data`. It
 * leaves the method with no argument for the body and nothing to send, and
 * for an operation whose body is its whole input (a QUERY) that is a request
 * the caller cannot make meaningful at all.
 */
function warnAboutUnboundBody(operation: PathInfo, onWarning?: (message: string) => void): void {
    const declared = Object.keys(operation.requestBody?.content ?? {});
    const subject =
        declared.length > 0
            ? `is declared only as ${declared.join(", ")}, which generated methods cannot send`
            : "declares no content type, so generated methods have nothing to send";
    onWarning?.(
        `The request body of ${describeOperation(operation)} ${subject}: a body gets an argument under a ` +
            "JSON, text or binary content type, and one argument per field under " +
            `${CONTENT_TYPES.MULTIPART} or ${CONTENT_TYPES.FORM_URLENCODED}. Sequential types (JSON Lines, ` +
            "event streams) and other multipart types are not generated as request bodies. Generated methods " +
            "take no argument for it and send the request without a body. Declare the body under a content " +
            "type that is generated to have it sent.",
    );
}

function resolveBodySchema(
    requestBody: RequestBody | undefined,
    contentType: string,
    resolveRef: ResolveRef,
): SwaggerDefinition | undefined {
    const schema = requestBody?.content?.[contentType]?.schema;
    return schema?.$ref ? resolveRef(schema.$ref) : schema;
}

function determineResponseInfo(operation: PathInfo): ResponseTypeInfo {
    const successResponses = ["200", "201", "202", "204", "206"];

    for (const statusCode of successResponses) {
        const response = operation.responses?.[statusCode];
        if (!response) continue;

        return getResponseInfoFromResponse(response);
    }

    return { responseType: "json" };
}

/**
 * Parameters no generated client binds. Every client — the service
 * generator and the resource plugin alike — takes path and query parameters
 * from `pathParams`/`queryParams` and the body from `requestBody`; anything
 * else on `parameters` is carried for the zod plugin but reaches no
 * signature. Warned here, once per run, so a plugin-only run sees it too:
 * the check used to live in the service generator, and
 * `generateServices: false` with the httpResource plugin lost a required
 * upload with zero warnings.
 *
 * Header and cookie parameters are expressible through the trailing options
 * argument, so only required ones — which the signature then fails to
 * mention — warn; warning about every optional header would bury that
 * case. Swagger 2.0 `formData` and `body` have no such escape hatch and
 * always warn, as does any `in` that is not a location at all.
 */
function warnAboutUnboundParameters(operation: PathInfo, onWarning?: (message: string) => void): void {
    for (const param of operation.parameters ?? []) {
        // A querystring parameter is bound, or skipped with its own warning,
        // by resolveQueryString.
        if (param.in === "path" || param.in === "query" || param.in === "querystring") {
            continue;
        }
        if (param.in === "header" || param.in === "cookie") {
            if (param.required) {
                onWarning?.(
                    `Required ${param.in} parameter "${param.name}" of ${describeOperation(operation)} is not bound by the ` +
                        "generated clients — callers must pass it through the trailing options parameter.",
                );
            }
            continue;
        }
        const kind =
            param.in === "formData" || param.in === "body"
                ? `Swagger 2.0 \`in: ${param.in}\``
                : `\`in: ${String(param.in)}\``;
        onWarning?.(
            `${kind} parameter "${param.name}" of ${describeOperation(operation)} is not supported and was dropped` +
                (param.required ? " (it is marked required)" : "") +
                ". Describe it as a requestBody, or as a path or query parameter, to have it generated.",
        );
    }
}
