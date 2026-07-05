import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { loadSpecContent } from "../src/core/spec-loader";

const tempDir = mkdtempSync(join(tmpdir(), "ng-openapi-loader-"));

afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadSpecContent", () => {
    it("reads local files", async () => {
        const file = join(tempDir, "spec.json");
        writeFileSync(file, '{"openapi":"3.0.0"}', "utf8");
        await expect(loadSpecContent(file)).resolves.toBe('{"openapi":"3.0.0"}');
    });

    it("throws for missing local files", async () => {
        await expect(loadSpecContent(join(tempDir, "missing.json"))).rejects.toThrow();
    });

    it("fetches URLs", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("openapi: 3.0.0", { status: 200 })),
        );
        await expect(loadSpecContent("https://example.com/spec.yaml")).resolves.toBe("openapi: 3.0.0");
    });

    it("wraps HTTP errors with the URL", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("x", { status: 500, statusText: "Server Error" })),
        );
        await expect(loadSpecContent("https://example.com/spec.json")).rejects.toThrow(
            /Failed to fetch content from URL: https:\/\/example.com\/spec.json - HTTP 500/,
        );
    });
});
