import { describe, expect, it } from "vitest";
import { isUrl } from "../src";

describe("isUrl", () => {
    it("accepts http and https URLs", () => {
        expect(isUrl("http://example.com/spec.json")).toBe(true);
        expect(isUrl("https://example.com/spec.yaml")).toBe(true);
    });

    it("rejects other protocols", () => {
        expect(isUrl("ftp://example.com/spec.json")).toBe(false);
        expect(isUrl("file:///c/specs/api.json")).toBe(false);
    });

    it("rejects plain file paths", () => {
        expect(isUrl("./specs/api.json")).toBe(false);
        expect(isUrl("C:\\specs\\api.json")).toBe(false);
        expect(isUrl("/usr/local/specs/api.yaml")).toBe(false);
    });

    it("rejects empty and garbage input", () => {
        expect(isUrl("")).toBe(false);
        expect(isUrl("not a url")).toBe(false);
    });
});
