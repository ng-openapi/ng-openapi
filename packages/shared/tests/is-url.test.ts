import { describe, expect, it } from "vitest";
// Deep import because is-url.ts is missing from the functions barrel — the same
// gap that forces generator.ts to deep-import it. Phase 1.2 of the refactoring
// plan exports it properly; switch this to "@ng-openapi/shared" then.
import { isUrl } from "@ng-openapi/shared/src/utils/functions/is-url";

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
