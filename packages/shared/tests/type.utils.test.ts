import { describe, expect, it } from "vitest";
import { escapeString, GeneratorConfig, getTypeScriptType, nullableType } from "@ng-openapi/shared";

const makeConfig = (dateType: "string" | "Date" = "string"): GeneratorConfig => ({
    input: "spec.json",
    output: "out",
    options: { dateType, enumStyle: "union" },
});

describe("getTypeScriptType", () => {
    const config = makeConfig();

    it("maps primitives", () => {
        expect(getTypeScriptType({ type: "string" }, config)).toBe("string");
        expect(getTypeScriptType({ type: "number" }, config)).toBe("number");
        expect(getTypeScriptType({ type: "integer" }, config)).toBe("number");
        expect(getTypeScriptType({ type: "boolean" }, config)).toBe("boolean");
        expect(getTypeScriptType({ type: "null" }, config)).toBe("null");
    });

    it("falls back to any for unknown or missing types", () => {
        expect(getTypeScriptType({}, config)).toBe("any");
        expect(getTypeScriptType(undefined, config)).toBe("any");
    });

    it("resolves $ref to a PascalCased type name", () => {
        expect(getTypeScriptType({ $ref: "#/components/schemas/user-profile" }, config)).toBe("UserProfile");
        expect(getTypeScriptType({ $ref: "#/definitions/Pet" }, config)).toBe("Pet");
    });

    it("maps arrays with item types", () => {
        expect(getTypeScriptType({ type: "array", items: { type: "string" } }, config)).toBe("Array<string>");
        expect(getTypeScriptType({ type: "array", items: { $ref: "#/definitions/Pet" } }, config)).toBe("Array<Pet>");
    });

    it("maps arrays without items to Array<unknown>", () => {
        expect(getTypeScriptType({ type: "array" }, config)).toBe("Array<unknown>");
    });

    it("wraps nullable arrays in parentheses", () => {
        expect(getTypeScriptType({ type: "array", items: { type: "string" }, nullable: true }, config)).toBe(
            "(Array<string> | null)",
        );
    });

    it("renders string enums as a union of literals", () => {
        expect(getTypeScriptType({ type: "string", enum: ["a", "b"] }, config)).toBe("'a' | 'b'");
    });

    it("escapes quotes in enum literals", () => {
        expect(getTypeScriptType({ type: "string", enum: ["it's done"] }, config)).toBe("'it\\'s done'");
    });

    it("maps date formats according to config.dateType", () => {
        expect(getTypeScriptType({ type: "string", format: "date-time" }, makeConfig("string"))).toBe("string");
        expect(getTypeScriptType({ type: "string", format: "date-time" }, makeConfig("Date"))).toBe("Date");
        expect(getTypeScriptType({ type: "string", format: "date" }, makeConfig("Date"))).toBe("Date");
    });

    it("maps binary strings to Blob for types and File for services", () => {
        expect(getTypeScriptType({ type: "string", format: "binary" }, config)).toBe("Blob");
        expect(getTypeScriptType({ type: "string", format: "binary" }, config, undefined, undefined, "service")).toBe(
            "File",
        );
    });

    it("maps well-known string formats to string", () => {
        for (const format of ["uuid", "email", "uri", "hostname", "ipv4", "ipv6"]) {
            expect(getTypeScriptType({ type: "string", format }, config)).toBe("string");
        }
    });

    it("maps objects depending on context", () => {
        expect(getTypeScriptType({ type: "object" }, config)).toBe("Record<string, any>");
        expect(getTypeScriptType({ type: "object" }, config, undefined, undefined, "service")).toBe("any");
    });

    it("appends | null when nullable", () => {
        expect(getTypeScriptType({ type: "string", nullable: true }, config)).toBe("string | null");
    });

    it("handles OpenAPI 3.1 type arrays", () => {
        expect(getTypeScriptType({ type: ["string", "null"] } as never, config)).toBe("string | null");
    });

    it("supports the legacy (type, format) call signature", () => {
        expect(getTypeScriptType("string", makeConfig("Date"), "date-time")).toBe("Date");
        expect(getTypeScriptType("string", config, true)).toBe("string | null");
    });
});

describe("nullableType", () => {
    it("appends | null only when nullable", () => {
        expect(nullableType("string", true)).toBe("string | null");
        expect(nullableType("string", false)).toBe("string");
        expect(nullableType("string")).toBe("string");
    });
});

describe("escapeString", () => {
    it("escapes single quotes and backslashes", () => {
        expect(escapeString("it's")).toBe("it\\'s");
        expect(escapeString("a\\b")).toBe("a\\\\b");
    });
});
