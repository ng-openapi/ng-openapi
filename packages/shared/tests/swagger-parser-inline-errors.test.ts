import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { GeneratorConfig } from "../src";
import { SpecParseError, SwaggerParser } from "../src";

// Whatever `inlineNestedRefs` can still throw on a pathological document — a
// RangeError from nesting depth, a DataCloneError out of structuredClone — must
// not escape `create`: cli.ts branches on the typed errors, and a bare
// RangeError prints "❌ Generation failed: Maximum call stack size exceeded"
// with no mention of the spec. Mocked rather than provoked, so the test asserts
// the contract instead of a V8 stack limit.
vi.mock("../src/core/inline-nested-refs", () => ({
    inlineNestedRefs: () => {
        throw new RangeError("Maximum call stack size exceeded");
    },
}));

const config: GeneratorConfig = {
    input: "spec.json",
    output: "out",
    options: { dateType: "string", enumStyle: "union" },
};

const tempDir = mkdtempSync(join(tmpdir(), "ng-openapi-inline-errors-"));

afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
});

describe("SwaggerParser.create when $ref inlining blows up", () => {
    it("re-wraps the failure as SpecParseError carrying the spec path", async () => {
        const specPath = join(tempDir, "spec.json");
        writeFileSync(specPath, JSON.stringify({ openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {} }));

        const error = await SwaggerParser.create(specPath, config).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(SpecParseError);
        expect((error as SpecParseError).source).toBe(specPath);
        expect((error as Error).message).toContain("Maximum call stack size exceeded");
        expect((error as Error).cause).toBeInstanceOf(RangeError);
    });
});
