import type { SwaggerDefinition } from "../../types/swagger.types";
import { CONTENT_TYPES } from "../content-types.constants";

/** How a request body of some media type is handed to `HttpClient`. */
export type BodyMediaFamily = "json" | "text" | "binary";

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
 * Whether the media type is a sequence of items rather than one document
 * (OpenAPI 3.2's "sequential media types"): JSON Lines and NDJSON, JSON text
 * sequences, and Server-Sent Events.
 */
export function isSequentialMediaType(contentType: string): boolean {
    const essence = mediaTypeEssence(contentType);
    return SEQUENTIAL_MEDIA_TYPES.has(essence) || essence.endsWith("+json-seq");
}

const SEQUENTIAL_MEDIA_TYPES: ReadonlySet<string> = new Set([
    "application/jsonl",
    "application/jsonlines",
    "application/x-jsonlines",
    "application/ndjson",
    "application/x-ndjson",
    "application/json-seq",
    "text/event-stream",
]);

/** Whether the media type is a range (`image/*`, `*`/`*`) rather than one type. */
export function isMediaTypeRange(contentType: string): boolean {
    return mediaTypeEssence(contentType).includes("*");
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
