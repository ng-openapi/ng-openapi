import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, methodSource } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";
import { HttpResourcePlugin } from "../src";

/**
 * A QUERY resource binds whatever body the core service would (#136): JSON
 * under any content key, text and binary, each one signal-or-value argument
 * read inside the request function.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

it("binds JSON-family, text and binary QUERY bodies as signal-aware arguments", async () => {
    const output = outputDirs.create("hr-body-types-");
    const ok = { "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } };
    const input = join(output, "spec.json");
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.2.0",
            info: { title: "Bodies", version: "1.0.0" },
            paths: {
                "/documents/select": {
                    query: {
                        operationId: "selectDocuments",
                        tags: ["Search"],
                        requestBody: {
                            required: true,
                            content: { "application/jsonpath": { schema: { type: "string" } } },
                        },
                        responses: ok,
                    },
                },
                "/documents/filter": {
                    query: {
                        operationId: "filterDocuments",
                        tags: ["Search"],
                        requestBody: {
                            required: true,
                            content: {
                                "application/vnd.api+json": { schema: { $ref: "#/components/schemas/Filter" } },
                            },
                        },
                        responses: ok,
                    },
                },
                // No type named: the schema says it is a JSON value.
                "/documents/match": {
                    query: {
                        operationId: "matchDocuments",
                        tags: ["Search"],
                        requestBody: {
                            required: true,
                            content: { "*/*": { schema: { $ref: "#/components/schemas/Filter" } } },
                        },
                        responses: ok,
                    },
                },
                "/documents/similar": {
                    query: {
                        operationId: "findSimilarDocuments",
                        tags: ["Search"],
                        requestBody: {
                            content: { "image/*": { schema: { type: "string", format: "binary" } } },
                        },
                        responses: { "204": { description: "none" } },
                    },
                },
            },
            components: { schemas: { Filter: { type: "object", properties: { text: { type: "string" } } } } },
        }),
    );

    await generateFromConfig({
        input,
        output,
        // An Accept default would put a headers merge into every method.
        options: { dateType: "string", enumStyle: "union", generateServices: true, emitAcceptHeader: false },
        plugins: [HttpResourcePlugin],
    });
    const search = readFileSync(join(output, "resources", "search.resource.ts"), "utf8");

    const select = methodSource(search, "selectDocuments");
    expect(select).toMatch(/^ {4}selectDocuments\(requestBody: Signal<string> \| string, resourceOptions\?:/);
    expect(select).toContain("body: typeof requestBody === 'function' ? requestBody() : requestBody,");
    expect(select).toContain("headers = { 'Content-Type': 'application/jsonpath', ...headers };");

    const filter = methodSource(search, "filterDocuments");
    expect(filter).toMatch(/^ {4}filterDocuments\(filter: Signal<Filter> \| Filter, resourceOptions\?:/);
    expect(filter).toContain("headers = { 'Content-Type': 'application/vnd.api+json', ...headers };");

    // Typed from the schema; HttpClient declares application/json for the value.
    const match = methodSource(search, "matchDocuments");
    expect(match).toMatch(/^ {4}matchDocuments\(filter: Signal<Filter> \| Filter, resourceOptions\?:/);
    expect(match).not.toContain("Content-Type");

    // A range of types: the Blob says which one it is, so the method sets no
    // header and has no headers to merge at all.
    const similar = methodSource(search, "findSimilarDocuments");
    expect(similar).toMatch(
        /^ {4}findSimilarDocuments\(requestBody\?: Signal<Blob \| undefined> \| Blob, resourceOptions\?:/,
    );
    expect(similar).toContain("body: typeof requestBody === 'function' ? requestBody() : requestBody,");
    expect(similar).not.toContain("Content-Type");
    expect(similar).not.toContain("let headers");

    expectGeneratedCodeCompiles(output, "httpResource output");
});
