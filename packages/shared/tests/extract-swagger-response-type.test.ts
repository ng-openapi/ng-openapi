import { describe, expect, it } from "vitest";
import {
    GeneratorConfig,
    getResponseType,
    getResponseTypeFromResponse,
    inferResponseTypeFromContentType,
    isPrimitiveType,
} from "../src";

const config: GeneratorConfig = {
    input: "spec.json",
    output: "out",
    options: { dateType: "string", enumStyle: "union" },
};

describe("inferResponseTypeFromContentType", () => {
    it("maps json content types to json", () => {
        expect(inferResponseTypeFromContentType("application/json")).toBe("json");
        expect(inferResponseTypeFromContentType("application/hal+json")).toBe("json");
        expect(inferResponseTypeFromContentType("application/vnd.api+json")).toBe("json");
    });

    it("ignores content-type parameters like charset", () => {
        expect(inferResponseTypeFromContentType("application/json; charset=utf-8")).toBe("json");
        expect(inferResponseTypeFromContentType("TEXT/PLAIN; charset=utf-8")).toBe("text");
    });

    it("maps xml to text", () => {
        expect(inferResponseTypeFromContentType("application/xml")).toBe("text");
        expect(inferResponseTypeFromContentType("application/soap+xml")).toBe("text");
    });

    it("maps text/* to text, except binary-like text types", () => {
        expect(inferResponseTypeFromContentType("text/plain")).toBe("text");
        expect(inferResponseTypeFromContentType("text/html")).toBe("text");
        expect(inferResponseTypeFromContentType("text/rtf")).toBe("blob");
        expect(inferResponseTypeFromContentType("text/calendar")).toBe("blob");
    });

    it("maps known binary types to arraybuffer", () => {
        expect(inferResponseTypeFromContentType("application/pdf")).toBe("arraybuffer");
        expect(inferResponseTypeFromContentType("image/png")).toBe("arraybuffer");
        expect(inferResponseTypeFromContentType("audio/mpeg")).toBe("arraybuffer");
        expect(inferResponseTypeFromContentType("application/octet-stream")).toBe("arraybuffer");
        expect(inferResponseTypeFromContentType("application/zip")).toBe("arraybuffer");
    });

    it("maps text-like application types to text", () => {
        expect(inferResponseTypeFromContentType("application/javascript")).toBe("text");
        expect(inferResponseTypeFromContentType("application/yaml")).toBe("text");
    });

    it("maps multipart/form-data to text", () => {
        expect(inferResponseTypeFromContentType("multipart/form-data")).toBe("text");
    });

    // Current behavior, frozen deliberately: the source compares against the
    // literal string "CONTENT_TYPES.FORM_URLENCODED" instead of the constant's
    // value, so url-encoded responses fall through to blob. Tracked for a
    // behavioral fix in a later refactoring phase (REFACTORING_PLAN.md §1.2/3.3).
    it("maps application/x-www-form-urlencoded to blob (known quirk)", () => {
        expect(inferResponseTypeFromContentType("application/x-www-form-urlencoded")).toBe("blob");
    });

    it("maps unknown content types to blob", () => {
        expect(inferResponseTypeFromContentType("application/x-custom")).toBe("blob");
    });
});

describe("isPrimitiveType", () => {
    it("accepts primitive schema types", () => {
        expect(isPrimitiveType({ type: "string" })).toBe(true);
        expect(isPrimitiveType({ type: "number" })).toBe(true);
        expect(isPrimitiveType({ type: "integer" })).toBe(true);
        expect(isPrimitiveType({ type: "boolean" })).toBe(true);
    });

    it("rejects complex schemas", () => {
        expect(isPrimitiveType({ type: "array", items: { type: "string" } })).toBe(false);
        expect(isPrimitiveType({ type: "object" })).toBe(false);
        expect(isPrimitiveType({ properties: { a: { type: "string" } } })).toBe(false);
        expect(isPrimitiveType({ $ref: "#/components/schemas/Order" })).toBe(false);
        expect(isPrimitiveType({ allOf: [] })).toBe(false);
        expect(isPrimitiveType(undefined)).toBe(false);
        expect(isPrimitiveType({})).toBe(false);
    });
});

describe("getResponseTypeFromResponse", () => {
    it("defaults to json for missing or empty content", () => {
        expect(getResponseTypeFromResponse({})).toBe("json");
        expect(getResponseTypeFromResponse({ content: {} })).toBe("json");
    });

    it("returns json for object json responses", () => {
        expect(
            getResponseTypeFromResponse({
                content: { "application/json": { schema: { type: "object" } } },
            }),
        ).toBe("json");
    });

    it("prefers text for primitive json responses", () => {
        expect(
            getResponseTypeFromResponse({
                content: { "application/json": { schema: { type: "string" } } },
            }),
        ).toBe("text");
    });

    it("returns blob when the schema format is binary", () => {
        expect(
            getResponseTypeFromResponse({
                content: { "application/json": { schema: { type: "string", format: "binary" } } },
            }),
        ).toBe("blob");
    });

    it("infers from the content type when there is no schema hint", () => {
        expect(getResponseTypeFromResponse({ content: { "application/pdf": {} } })).toBe("arraybuffer");
        expect(getResponseTypeFromResponse({ content: { "text/plain": {} } })).toBe("text");
    });

    it("lets custom responseTypeMapping win over inference", () => {
        expect(
            getResponseTypeFromResponse({ content: { "application/pdf": {} } }, { "application/pdf": "blob" }),
        ).toBe("blob");
    });

    it("prefers the higher-priority content type when several are present", () => {
        expect(
            getResponseTypeFromResponse({
                content: {
                    "application/xml": {},
                    "application/json": { schema: { type: "object" } },
                },
            }),
        ).toBe("json");
    });
});

describe("getResponseType", () => {
    it("uses the schema's TypeScript type when a schema exists", () => {
        expect(
            getResponseType(
                { content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } },
                config,
            ),
        ).toBe("Order");
    });

    it("falls back to the HTTP response type mapping without a schema", () => {
        expect(getResponseType({ content: { "application/pdf": {} } }, config)).toBe("ArrayBuffer");
        expect(getResponseType({ content: { "text/plain": {} } }, config)).toBe("string");
        expect(getResponseType({ content: { "application/x-custom": {} } }, config)).toBe("Blob");
        expect(getResponseType({}, config)).toBe("any");
    });
});
