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
 * How a request body declared under `contentType` is sent, or undefined when
 * a generated method cannot send one:
 *
 * - a sequential type is a stream of items, not one value to pass;
 * - `multipart/*` other than `multipart/form-data`, which the normalizer
 *   binds field by field before it asks here, has no generated encoding.
 *
 * Everything else is one of three things `HttpClient` already knows how to
 * send: a value it serializes as JSON, a string, or a `Blob`. A range is
 * binary — "any image", "anything" — unless it is a range of text.
 */
export function bodyMediaFamily(contentType: string): BodyMediaFamily | undefined {
    const essence = mediaTypeEssence(contentType);
    if (!essence.includes("/")) {
        return undefined;
    }
    if (isSequentialMediaType(essence) || essence.startsWith("multipart/")) {
        return undefined;
    }
    if (isMediaTypeRange(essence)) {
        return essence.startsWith("text/") ? "text" : "binary";
    }
    if (isJsonMediaType(essence)) {
        return "json";
    }
    // Shares the response side's view of what is text. Its "json" is "the name
    // contains json", and whatever that still matches here is not a JSON
    // document (`application/jsonpath`): a string.
    const inferred = inferResponseTypeFromContentType(essence);
    return inferred === "text" || inferred === "json" ? "text" : "binary";
}
