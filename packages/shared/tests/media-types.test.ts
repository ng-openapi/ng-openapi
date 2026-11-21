import { describe, expect, it } from "vitest";
import {
    bodyMediaFamily,
    inferResponseTypeFromContentType,
    isJsonMediaType,
    isMediaTypeRange,
    isSequentialMediaType,
    mediaTypeEssence,
    sequenceFormat,
} from "../src/utils/functions/media-types";

describe("media types", () => {
    it("reads the essence of a media type: no parameters, lower case", () => {
        expect(mediaTypeEssence("Application/JSON; charset=utf-8")).toBe("application/json");
        expect(mediaTypeEssence(" text/plain ;charset=iso-8859-1")).toBe("text/plain");
        expect(mediaTypeEssence("image/png")).toBe("image/png");
    });

    it.each([
        "application/json",
        "application/json; charset=utf-8",
        "APPLICATION/JSON",
        "application/merge-patch+json",
        "application/vnd.api+json",
        "application/problem+json",
        "text/json",
    ])("%s is a JSON document", (contentType) => {
        expect(isJsonMediaType(contentType)).toBe(true);
    });

    // The name contains "json"; the content is not one JSON document.
    it.each([
        "application/jsonl",
        "application/x-ndjson",
        "application/json-seq",
        "application/jsonpath",
        "text/plain",
    ])("%s is not", (contentType) => {
        expect(isJsonMediaType(contentType)).toBe(false);
    });

    it.each([
        "application/jsonl",
        "application/x-ndjson",
        "application/json-seq",
        "application/geo+json-seq",
        "text/event-stream",
        "text/event-stream; charset=utf-8",
    ])("%s is a sequence of items", (contentType) => {
        expect(isSequentialMediaType(contentType)).toBe(true);
    });

    it("tells a range from a type", () => {
        expect(isMediaTypeRange("image/*")).toBe(true);
        expect(isMediaTypeRange("*/*")).toBe(true);
        expect(isMediaTypeRange("image/png")).toBe(false);
    });
});

describe("sequential media types", () => {
    it.each([
        ["application/jsonl", "json-lines"],
        ["application/x-ndjson", "json-lines"],
        ["application/ndjson", "json-lines"],
        ["application/x-jsonlines", "json-lines"],
        ["Application/JSONL; charset=utf-8", "json-lines"],
        ["application/json-seq", "json-seq"],
        ["application/geo+json-seq", "json-seq"],
        ["text/event-stream", "event-stream"],
    ])("%s is read as %s", (contentType, format) => {
        expect(sequenceFormat(contentType)).toBe(format);
    });

    // Sequential by the specification, but with no generated reader.
    it.each(["multipart/mixed", "application/json", "text/plain", "application/geo+json"])(
        "%s is not read item by item",
        (contentType) => {
            expect(sequenceFormat(contentType)).toBeUndefined();
        },
    );

    it.each(["application/jsonl", "application/x-ndjson", "application/json-seq", "text/event-stream"])(
        "%s is fetched as text: JSON.parse fails on the second item of one",
        (contentType) => {
            expect(inferResponseTypeFromContentType(contentType)).toBe("text");
        },
    );

    it("still fetches a JSON document as JSON", () => {
        expect(inferResponseTypeFromContentType("application/json")).toBe("json");
        expect(inferResponseTypeFromContentType("application/geo+json")).toBe("json");
    });
});

describe("how a request body of a media type is sent", () => {
    it.each([
        ["application/json; charset=utf-8", "json"],
        ["application/merge-patch+json", "json"],
        ["application/vnd.api+json", "json"],
        ["text/plain", "text"],
        ["text/plain; charset=utf-8", "text"],
        ["text/csv", "text"],
        ["application/xml", "text"],
        ["application/soap+xml", "text"],
        ["application/yaml", "text"],
        // Not a JSON document, though the name says json: a string.
        ["application/jsonpath", "text"],
        ["text/*", "text"],
        ["application/octet-stream", "binary"],
        ["application/pdf", "binary"],
        ["image/png", "binary"],
        ["application/vnd.ms-excel", "binary"],
        ["image/*", "binary"],
        ["*/*", "binary"],
    ])("%s → %s", (contentType, family) => {
        expect(bodyMediaFamily(contentType)).toBe(family);
    });

    it.each([
        "application/jsonl",
        "application/x-ndjson",
        "text/event-stream",
        "multipart/mixed",
        "multipart/related",
        "not-a-media-type",
        "",
    ])("%s cannot be sent as one value", (contentType) => {
        expect(bodyMediaFamily(contentType)).toBeUndefined();
    });
});
