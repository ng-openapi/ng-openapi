import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";
import { ZodPlugin } from "@ng-openapi/zod";

/**
 * Methods the Path Item Object has no field for (#136): OpenAPI 3.2 declares
 * them under `additionalOperations`. The golden suite snapshots the output of
 * the same fixture; these tests say what about it matters, and that it
 * compiles.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

async function generate(prefix: string, config: Partial<GeneratorConfig> & { spec?: unknown } = {}) {
    const output = outputDirs.create(prefix);
    const { spec, ...rest } = config;
    let input = fixturePath("openapi-3.2");
    if (spec !== undefined) {
        input = join(output, "spec.json");
        writeFileSync(input, JSON.stringify(spec));
    }
    const result = await generateFromConfig({
        input,
        output,
        ...rest,
        options: { dateType: "string", enumStyle: "union", generateServices: true, ...rest.options },
    });
    const service = (name: string) => readFileSync(join(output, "services", `${name}.service.ts`), "utf8");
    return { output, result, service };
}

/** Warnings about extra methods; the fixture's QUERY operations have their own. */
const aboutMethods = (warnings: readonly string[]) =>
    warnings.filter((warning) => warning.includes("additionalOperations") || warning.includes("TRACE"));

describe("operations declared under additionalOperations (#136)", () => {
    it("generates a service method that sends the declared method, body included", async () => {
        const { output, result, service } = await generate("additional-ops-", { plugins: [ZodPlugin] });
        const products = service("products");

        const copyProduct = methodSource(products, "copyProduct");
        expect(copyProduct).toMatch(/^ {4}copyProduct\(productId: string, productCopy: ProductCopy, observe\?:/);
        expect(copyProduct).toContain("request('copy', url, {");
        expect(copyProduct).toMatch(/request\('copy', url, \{\s+body: productCopy,/);
        expect(copyProduct).toContain("headers = headers.set('Content-Type', 'application/json');");

        // The zod plugin reads the same operations.
        const validators = readFileSync(join(output, "validators", "products.validator.ts"), "utf8");
        expect(validators).toContain("export const copyProductBody =");

        expect(aboutMethods(result.warnings)).toEqual([]);
        expectGeneratedCodeCompiles(output);
    });

    it("names an operation without an operationId after its path and method", async () => {
        const { service } = await generate("additional-ops-names-");
        const purge = methodSource(service("products"), "productsProductIdPurge");

        expect(purge).toMatch(/^ {4}productsProductIdPurge\(productId: string, observe\?:/);
        expect(purge).toContain("request('purge', url, {");
        // No body is declared, and unlike POST, PUT and PATCH none is spelled out.
        expect(purge).not.toContain("body:");
    });
});

describe("methods a generated client cannot or must not send", () => {
    const ok = { "204": { description: "done" } };
    const spec = {
        openapi: "3.2.0",
        info: { title: "Methods", version: "1.0.0" },
        paths: {
            "/files/{fileId}": {
                parameters: [{ name: "fileId", in: "path", required: true, schema: { type: "string" } }],
                get: { operationId: "getFile", tags: ["Files"], responses: ok },
                trace: { operationId: "traceFile", tags: ["Files"], responses: ok },
                additionalOperations: {
                    // Any HTTP token is a method name — an apostrophe included,
                    // which would end the literal it is emitted into.
                    "M-SEARCH": { tags: ["Files"], responses: ok },
                    "LOCK'D": { operationId: "lockFile", tags: ["Files"], responses: ok },
                    move: { operationId: "moveFile", tags: ["Files"], responses: ok },
                    POST: { operationId: "createFile", tags: ["Files"], responses: ok },
                    CONNECT: { operationId: "tunnelFile", tags: ["Files"], responses: ok },
                    "NOT A METHOD": { operationId: "brokenFile", tags: ["Files"], responses: ok },
                },
            },
        },
    };

    it("generates the methods it can send, with the name escaped where it is written into code", async () => {
        const { output, service } = await generate("additional-ops-tokens-", { spec });
        const files = service("files");

        expect(methodSource(files, "filesFileIdMSearch")).toContain("request('m-search', url, {");
        expect(methodSource(files, "lockFile")).toContain("request('lock\\'d', url, {");
        expect(methodSource(files, "moveFile")).toContain("request('move', url, {");

        expectGeneratedCodeCompiles(output);
    });

    it("skips the rest, and says why for each", async () => {
        const { result, service } = await generate("additional-ops-skipped-", { spec });
        const files = service("files");

        for (const skipped of ["traceFile", "createFile", "tunnelFile", "brokenFile"]) {
            expect(files).not.toContain(`${skipped}(`);
        }
        // Wording is pinned in shared/tests/extract-paths.test.ts.
        expect(aboutMethods(result.warnings)).toEqual([
            expect.stringContaining("Operation traceFile ((TRACE) /files/{fileId}) was skipped: browsers refuse"),
            expect.stringContaining(
                'Operation "move" under `additionalOperations` of path "/files/{fileId}" is sent as MOVE',
            ),
            expect.stringContaining('Operation "POST" under `additionalOperations`'),
            expect.stringContaining('Operation "CONNECT" under `additionalOperations`'),
            expect.stringContaining('Operation "NOT A METHOD" under `additionalOperations`'),
        ]);
    });
});
