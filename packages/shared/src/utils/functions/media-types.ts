import type { SwaggerDefinition } from "../../types/swagger.types";
import { CONTENT_TYPES } from "../content-types.constants";

/** How a request body of some media type is handed to `HttpClient`. */
export type BodyMediaFamily = "json" | "text" | "binary";

/**
 * The sequential media types a generated client reads item by item: one JSON
 * document per line, JSON text sequences (RFC 7464), and Server-Sent Events.
 */
export type SequenceFormat = "json-lines" | "json-seq" | "event-stream";

/** A media type without its parameters, lower-cased: `Application/JSON; charset=utf-8` → `application/json`. */
export function mediaTypeEssence(contentType: string): string {
    return contentType.split(";")[0].trim().toLowerCase();
}

/**
 * Whether the media type is one JSON document: `application/json` under any
 * spelling or parameters, and every `+json` structured syntax
 * (`application/merge-patch+json`, `application/vnd.api+json`).
 *
 * Narrower on purpose than "the name contains json": `application/jsonl` is a
 * sequence of documents and `application/jsonpath` is not JSON at all.
 */
export function isJsonMediaType(contentType: string): boolean {
    const essence = mediaTypeEssence(contentType);
    return JSON_MEDIA_TYPES.has(essence) || essence.endsWith("+json");
}

const JSON_MEDIA_TYPES: ReadonlySet<string> = new Set([
    "application/json",
    "application/x-json",
    "text/json",
    "text/x-json",
]);

/**
 * How the items of a sequential media type are delimited, or undefined when
 * the media type is not one a generated client reads item by item.
 * `multipart/mixed` is sequential too, but has no generated reader.
 */
export function sequenceFormat(contentType: string): SequenceFormat | undefined {
    const essence = mediaTypeEssence(contentType);
    if (JSON_LINES_MEDIA_TYPES.has(essence)) {
        return "json-lines";
    }
    if (essence === "application/json-seq" || essence.endsWith("+json-seq")) {
        return "json-seq";
    }
    return essence === "text/event-stream" ? "event-stream" : undefined;
}

/** JSON Lines and NDJSON are the same format under several unregistered names. */
const JSON_LINES_MEDIA_TYPES: ReadonlySet<string> = new Set([
    "application/jsonl",
    "application/jsonlines",
    "application/x-jsonlines",
    "application/ndjson",
    "application/x-ndjson",
]);

/**
 * Whether the media type is a sequence of items rather than one document
 * (OpenAPI 3.2's "sequential media types"): JSON Lines and NDJSON, JSON text
 * sequences, and Server-Sent Events.
 */
export function isSequentialMediaType(contentType: string): boolean {
    return sequenceFormat(contentType) !== undefined;
}

/** Whether the media type is a range (`image/*`, `*`/`*`) rather than one type. */
export function isMediaTypeRange(contentType: string): boolean {
    return mediaTypeEssence(contentType).includes("*");
}

/**
 * Maps a MIME type (parameters like charset stripped) to the Angular
 * `responseType` used when fetching it; unknown types are assumed binary.
 */
export function inferResponseTypeFromContentType(contentType: string): "json" | "blob" | "arraybuffer" | "text" {
    // Normalize content type (remove parameters like charset)
    const normalizedType = mediaTypeEssence(contentType);

    // A sequence of items is not one JSON document, whatever its name says:
    // `JSON.parse` fails on the second line of `application/jsonl`. It is
    // fetched as text and split into its items.
    if (isSequentialMediaType(normalizedType)) {
        return "text";
    }

    // JSON types (highest priority for structured data)
    if (
        normalizedType.includes("json") ||
        normalizedType === "application/ld+json" ||
        normalizedType === "application/hal+json" ||
        normalizedType === "application/vnd.api+json"
    ) {
        return "json";
    }

    // XML can be treated as text for parsing
    if (
        normalizedType.includes("xml") ||
        normalizedType === "application/soap+xml" ||
        normalizedType === "application/atom+xml" ||
        normalizedType === "application/rss+xml"
    ) {
        return "text";
    }

    // Text types (but exclude certain binary-like text types)
    if (normalizedType.startsWith("text/")) {
        // These text types are better handled as blobs
        const binaryTextTypes = ["text/rtf", "text/cache-manifest", "text/vcard", "text/calendar"];

        if (binaryTextTypes.includes(normalizedType)) {
            return "blob";
        }

        return "text";
    }

    // Form data should be handled as text for parsing
    if (normalizedType === "CONTENT_TYPES.FORM_URLENCODED" || normalizedType === "multipart/form-data") {
        return "text";
    }

    // Specific text-like application types
    if (
        normalizedType === "application/javascript" ||
        normalizedType === "application/typescript" ||
        normalizedType === "application/css" ||
        normalizedType === "application/yaml" ||
        normalizedType === "application/x-yaml" ||
        normalizedType === "application/toml"
    ) {
        return "text";
    }

    // Binary types that should use arraybuffer for better performance
    if (
        normalizedType.startsWith("image/") ||
        normalizedType.startsWith("audio/") ||
        normalizedType.startsWith("video/") ||
        normalizedType === "application/pdf" ||
        normalizedType === "application/zip" ||
        normalizedType.includes("octet-stream")
    ) {
        return "arraybuffer";
    }

    // Everything else is likely binary and should be blob
    return "blob";
}

/**
 * Whether a body of the media type is text, which a method takes as a
 * `string`: every `text/*` type, the `application/*` types that are text by
 * definition, and an `application/*` type with an XML or YAML structured
 * syntax suffix (`application/soap+xml`).
 *
 * Read off the parts of the name, never off a substring of it:
 * `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` is a
 * zipped workbook whose name happens to contain "xml", and `image/svg+xml`
 * is uploaded as the file it is. This is the request side's own answer on
 * purpose. The response side asks a different question — how to read what
 * came back — and settles some of these the other way.
 */
function isTextMediaType(essence: string): boolean {
    if (essence.startsWith("text/")) {
        return true;
    }
    if (!essence.startsWith("application/")) {
        return false;
    }
    return TEXT_APPLICATION_TYPES.has(essence) || TEXT_SUFFIXES.some((suffix) => essence.endsWith(suffix));
}

const TEXT_APPLICATION_TYPES: ReadonlySet<string> = new Set([
    "application/xml",
    "application/xml-dtd",
    "application/yaml",
    "application/x-yaml",
    "application/toml",
    "application/javascript",
    "application/x-javascript",
    "application/ecmascript",
    "application/typescript",
    "application/css",
    "application/graphql",
    "application/sql",
    "application/sparql-query",
    "application/sparql-update",
    // Not a JSON document, though the name says json.
    "application/jsonpath",
]);

const TEXT_SUFFIXES: readonly string[] = ["+xml", "+yaml"];

/**
 * The ranges that say nothing about what the body is. swagger-core writes
 * `*`/`*` for every JAX-RS body without `@Consumes`, with the schema of the
 * entity under it.
 */
const UNSPECIFIC_RANGES: ReadonlySet<string> = new Set(["*/*", "application/*"]);

/**
 * How a body is sent when its content type does not say what it is: by what
 * its schema describes. Binary, or nothing at all, is a `Blob`; a string is
 * sent as text; anything else — an object, an array, a number, a `$ref` to
 * one — is a value serialized as JSON.
 */
function familyOfDescribedBody(schema: SwaggerDefinition | undefined): BodyMediaFamily {
    if (!schema || Object.keys(schema).length === 0 || schema.format === "binary") {
        return "binary";
    }
    return schema.type === "string" ? "text" : "json";
}

/**
 * How a request body declared under `contentType` is sent, or undefined when
 * it is not sent as one value:
 *
 * - a sequential type is a stream of items;
 * - the two forms, `multipart/form-data` and
 *   `application/x-www-form-urlencoded`, are bound field by field, which the
 *   normalizer does before it asks here;
 * - any other `multipart/*` type has no generated encoding.
 *
 * Everything else is one of three things `HttpClient` already knows how to
 * send: a value it serializes as JSON, a string, or a `Blob`. JSON and text
 * are recognised by name, ranges of them included (`application/*+json`,
 * `text/*`), and whatever is neither is binary — "any image", a PDF, a
 * spreadsheet.
 *
 * `*`/`*` and `application/*` name nothing, so there the body's `schema`
 * decides, when the caller has it: pass it with any `$ref` already followed.
 * Without one such a body is binary.
 */
export function bodyMediaFamily(contentType: string, schema?: SwaggerDefinition): BodyMediaFamily | undefined {
    const essence = mediaTypeEssence(contentType);
    if (!essence.includes("/")) {
        return undefined;
    }
    if (
        isSequentialMediaType(essence) ||
        essence.startsWith("multipart/") ||
        essence === CONTENT_TYPES.FORM_URLENCODED
    ) {
        return undefined;
    }
    if (isJsonMediaType(essence)) {
        return "json";
    }
    if (isTextMediaType(essence)) {
        return "text";
    }
    if (UNSPECIFIC_RANGES.has(essence)) {
        return familyOfDescribedBody(schema);
    }
    return "binary";
}
