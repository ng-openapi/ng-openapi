import { describe, expect, it } from "vitest";
// Concrete-module imports on purpose: these are internal units, not part of the
// public barrel — the SwaggerParser façade is the public surface.
import { detectFormat, parseSpecContent } from "../src/core/spec-format";

describe("detectFormat", () => {
    it("detects JSON by leading brace or bracket", () => {
        expect(detectFormat('{ "openapi": "3.0.0" }')).toBe("json");
        expect(detectFormat("[1, 2]")).toBe("json");
    });

    it("detects YAML by spec markers and key: patterns", () => {
        expect(detectFormat("openapi: 3.0.0")).toBe("yaml");
        expect(detectFormat("swagger: '2.0'")).toBe("yaml");
        expect(detectFormat("---\nfoo: bar")).toBe("yaml");
        expect(detectFormat("info:\n  title: x")).toBe("yaml");
    });

    it("defaults to JSON for ambiguous content", () => {
        expect(detectFormat("42")).toBe("json");
    });
});

describe("parseSpecContent", () => {
    it("parses JSON by .json extension", () => {
        expect(parseSpecContent('{ "openapi": "3.1.0" }', "spec.json").openapi).toBe("3.1.0");
    });

    it("parses YAML by .yaml/.yml extension", () => {
        expect(parseSpecContent("openapi: 3.0.0", "spec.yaml").openapi).toBe("3.0.0");
        expect(parseSpecContent("swagger: '2.0'", "spec.yml").swagger).toBe("2.0");
    });

    it("auto-detects for unknown extensions", () => {
        expect(parseSpecContent('{ "swagger": "2.0" }', "spec.txt").swagger).toBe("2.0");
        expect(parseSpecContent("openapi: 3.0.3", "spec.txt").openapi).toBe("3.0.3");
    });

    it("uses the URL pathname extension for URLs", () => {
        expect(parseSpecContent("openapi: 3.0.0", "https://example.com/api/spec.yaml?v=2").openapi).toBe("3.0.0");
        expect(parseSpecContent('{ "openapi": "3.0.0" }', "https://example.com/spec.json").openapi).toBe("3.0.0");
        // No extension in the URL path → content detection
        expect(parseSpecContent("openapi: 3.0.0", "https://example.com/openapi").openapi).toBe("3.0.0");
    });

    it("throws a format-specific error for unparseable content", () => {
        expect(() => parseSpecContent("{ not json", "broken.json")).toThrow(/Failed to parse JSON content/);
        expect(() => parseSpecContent("\t- weird: [", "broken.yaml")).toThrow(/Failed to parse YAML content/);
    });
});
