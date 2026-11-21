import { inferResponseTypeFromContentType } from "./extract-swagger-response-type";

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
