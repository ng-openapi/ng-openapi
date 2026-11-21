import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";
import { HttpResourcePlugin } from "../src";

/**
 * Resources for the HTTP QUERY method (#136). QUERY is the one read that
 * carries a body, so this is where the plugin binds body arguments at all:
 * signal-aware like its other arguments, and with the Content-Type the core
 * service would set.
 */

// Pinned, so the warning test below keeps testing something whatever Angular
// this repo is installed with.
vi.mock("../../../ng-openapi/src/lib/core/angular-version", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../../ng-openapi/src/lib/core/angular-version")>()),
    detectAngularCoreVersion: () => "21.2.13",
}));

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

/** The request object a resource method returns from its request function. */
function requestEntries(method: string): string {
    return (
        /return \{\n([\s\S]*?)\n\s+\}\n\s+\}, resourceOptions\);/.exec(method)?.[1].replace(/\s+/g, " ").trim() ?? ""
    );
}

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
        plugins: [HttpResourcePlugin],
        ...rest,
        options: { dateType: "string", enumStyle: "union", generateServices: true, ...rest.options },
    });
    const resource = (name: string) => readFileSync(join(output, "resources", `${name}.resource.ts`), "utf8");
    return { output, result, resource };
}

const OMIT_WITHOUT_BODY = `requestOptions?: Omit<HttpResourceRequest, "method" | "url" | "params">`;
const OMIT_WITH_BODY = `requestOptions?: Omit<HttpResourceRequest, "method" | "url" | "params" | "body">`;

describe("httpResource for HTTP QUERY operations (#136)", () => {
    it("generates a resource per QUERY operation, next to the GET ones", async () => {
        const { output, resource } = await generate("hr-query-");
        const products = resource("products");

        const searchProducts = methodSource(products, "searchProducts");
        expect(searchProducts).toMatch(
            /^ {4}searchProducts\(productSearch: Signal<ProductSearch> \| ProductSearch, limit\?: Signal<number \| undefined> \| number,/,
        );
        // The body is read inside the request function, so a signal re-sends
        // the query; it comes after the spread, where a caller cannot replace it.
        expect(requestEntries(searchProducts)).toBe(
            "url: `${this.basePath}/products/search`, " +
                'method: "QUERY", ' +
                "...requestOptions, " +
                "body: typeof productSearch === 'function' ? productSearch() : productSearch, " +
                "params, " +
                "headers, " +
                "context: this.createContextWithClientId(requestOptions?.context)",
        );
        expect(searchProducts).toContain(OMIT_WITH_BODY);
        expect(searchProducts).toContain(
            "headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...headers };",
        );

        // A GET resource keeps the signature and request it has always had.
        const listProducts = methodSource(products, "listProducts");
        expect(listProducts).toContain(OMIT_WITHOUT_BODY);
        expect(requestEntries(listProducts)).toContain('method: "GET", ...requestOptions, params, headers,');
        expect(listProducts).not.toContain("Content-Type");

        expectGeneratedCodeCompiles(output, "httpResource output");
    });

    it("binds an optional JSON body as an optional signal-or-value argument", async () => {
        const { resource } = await generate("hr-query-optional-");
        const related = methodSource(resource("products"), "productsProductIdRelatedQuery");

        expect(related).toMatch(
            /^ {4}productsProductIdRelatedQuery\(productId: Signal<string> \| string, relatedFilter\?: Signal<RelatedFilter \| undefined> \| RelatedFilter, resourceOptions\?:/,
        );
        expect(requestEntries(related)).toContain(
            "body: typeof relatedFilter === 'function' ? relatedFilter() : relatedFilter,",
        );
    });

    it("sends a QUERY that declares no body without one", async () => {
        const { resource } = await generate("hr-query-bodyless-");
        const featured = methodSource(resource("products"), "queryFeaturedProducts");

        expect(featured).toMatch(/^ {4}queryFeaturedProducts\(resourceOptions\?:/);
        expect(featured).toContain(OMIT_WITHOUT_BODY);
        expect(requestEntries(featured)).toBe(
            "url: `${this.basePath}/products/featured`, " +
                'method: "QUERY", ' +
                "...requestOptions, " +
                "headers, " +
                "context: this.createContextWithClientId(requestOptions?.context)",
        );
        expect(featured).not.toContain("Content-Type");
    });

    it("builds a urlencoded body from signal-aware fields and declares its Content-Type", async () => {
        const { resource } = await generate("hr-query-urlencoded-");
        const searchOrders = methodSource(resource("orders"), "searchOrders");

        expect(searchOrders).toMatch(
            /^ {4}searchOrders\(status: Signal<OrderStatus> \| OrderStatus, customerId\?: Signal<string \| undefined> \| string, tags\?: Signal<Array<string> \| undefined> \| Array<string>, resourceOptions\?:/,
        );
        expect(searchOrders).toContain(
            "const customerIdField = typeof customerId === 'function' ? customerId() : customerId;",
        );
        expect(searchOrders).toContain("formBody.append('customer-id', String(customerIdField));");
        expect(searchOrders).toContain("'Content-Type': 'application/x-www-form-urlencoded'");
        expect(requestEntries(searchOrders)).toContain("...requestOptions, body: formBody.toString(), headers,");
    });

    it("builds a multipart body and lets no Content-Type through, whoever set it", async () => {
        const { resource } = await generate("hr-query-multipart-");
        const matchImages = methodSource(resource("images"), "matchImages");

        expect(matchImages).toMatch(
            /^ {4}matchImages\(image: Signal<Blob> \| Blob, threshold\?: Signal<number \| undefined> \| number,/,
        );
        expect(matchImages).toContain("const imageField = typeof image === 'function' ? image() : image;");
        expect(matchImages).toContain("formData.append('image', imageField);");
        expect(matchImages).toContain("formData.append('threshold', String(thresholdField));");
        expect(matchImages).toContain("headers = headers.delete('Content-Type');");
        expect(matchImages).toContain(".filter(([name]) => name.toLowerCase() !== 'content-type'));");
        expect(matchImages).not.toContain("'Content-Type':");
        expect(requestEntries(matchImages)).toContain("...requestOptions, body: formData, headers,");
    });

    it("uses the blob flavor for a QUERY that returns a file", async () => {
        const { resource } = await generate("hr-query-blob-");
        const exportOrders = methodSource(resource("orders"), "exportOrders");

        expect(exportOrders).toContain("return httpResource.blob(() => {");
        expect(exportOrders).toContain("HttpResourceRef<Blob | undefined>");
    });

    it("warns about an Angular older than 22.3 in a plugin-only run too", async () => {
        const { output, result } = await generate("hr-query-warning-", {
            options: { dateType: "string", enumStyle: "union", generateServices: false },
        });
        const aboutQuery = result.warnings.filter((warning) => warning.includes("HTTP QUERY method"));

        // Once: the core reports it for the run, not each generator for itself.
        expect(aboutQuery).toHaveLength(1);
        expect(aboutQuery[0]).toContain("supports from 22.3 — found @angular/core 21.2.13 in this workspace");
        expectGeneratedCodeCompiles(output, "plugin-only httpResource output");
    });
});

describe("httpResource QUERY bodies: names and headers that collide", () => {
    const ok = { "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } };
    const form = (contentType: string, properties: Record<string, object>, required: string[] = []) => ({
        required: true,
        content: { [contentType]: { schema: { type: "object", required, properties } } },
    });
    const spec = {
        openapi: "3.2.0",
        info: { title: "Collisions", version: "1.0.0" },
        paths: {
            // A field named like the local the form is built in.
            "/uploads/match": {
                query: {
                    operationId: "matchUpload",
                    tags: ["Search"],
                    requestBody: form("multipart/form-data", {
                        formData: { type: "string", format: "binary" },
                        note: { type: "string" },
                    }),
                    responses: { "204": { description: "no content" } },
                },
            },
            // `id` is a query parameter and a form field: one argument, read
            // once for each place it is sent to.
            "/items/search": {
                query: {
                    operationId: "searchItems",
                    tags: ["Search"],
                    parameters: [{ name: "id", in: "query", schema: { type: "string" } }],
                    requestBody: form("application/x-www-form-urlencoded", {
                        id: { type: "string" },
                        formBody: { type: "string" },
                    }),
                    responses: ok,
                },
            },
            // A JSON body with no schema of its own.
            "/anything": {
                query: {
                    operationId: "queryAnything",
                    tags: ["Search"],
                    requestBody: { content: { "application/json": {} } },
                    responses: ok,
                },
            },
            // A body under a content type no generated method binds.
            "/notes": {
                query: {
                    operationId: "queryNotes",
                    tags: ["Search"],
                    requestBody: { required: true, content: { "text/plain": { schema: { type: "string" } } } },
                    responses: ok,
                },
            },
        },
    };

    it("takes no argument and sends no body for a content type it cannot bind, out loud", async () => {
        const { resource, result } = await generate("hr-query-unbound-", { spec });
        const queryNotes = methodSource(resource("search"), "queryNotes");

        // With no argument left, the resource sends this empty QUERY the
        // moment it is created — the caller has to hear about it here.
        expect(queryNotes).toMatch(/^ {4}queryNotes\(resourceOptions\?:/);
        expect(queryNotes).toContain(OMIT_WITHOUT_BODY);
        expect(queryNotes).not.toContain("body:");
        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(result.warnings.filter((warning) => warning.includes("queryNotes"))).toEqual([
            expect.stringContaining(
                "The request body of queryNotes ((QUERY) /notes) is declared only as text/plain, which generated " +
                    "methods do not bind",
            ),
        ]);
    });

    it("derives the form locals around the arguments, and still compiles", async () => {
        const { output, resource } = await generate("hr-query-collisions-", { spec });
        const search = resource("search");

        const matchUpload = methodSource(search, "matchUpload");
        expect(matchUpload).toMatch(
            /^ {4}matchUpload\(formData\?: Signal<Blob \| undefined> \| Blob, note\?: Signal<string \| undefined> \| string,/,
        );
        expect(matchUpload).toContain("const formData2 = new FormData();");
        expect(matchUpload).toContain("formData2.append('formData', formDataField);");
        expect(requestEntries(matchUpload)).toContain("body: formData2,");

        const searchItems = methodSource(search, "searchItems");
        expect(searchItems).toContain("const idValue = typeof id === 'function' ? id() : id;");
        expect(searchItems).toContain("const idField = typeof id === 'function' ? id() : id;");
        expect(searchItems).toContain("const formBody2 = new URLSearchParams();");
        expect(requestEntries(searchItems)).toContain("body: formBody2.toString(), params, headers,");

        const queryAnything = methodSource(search, "queryAnything");
        expect(queryAnything).toMatch(
            /^ {4}queryAnything\(requestBody\?: Signal<any \| undefined> \| any, resourceOptions\?:/,
        );

        expectGeneratedCodeCompiles(output, "httpResource output");
    });

    it("merges headers for a multipart body even when there is no default to add", async () => {
        const { resource } = await generate("hr-query-no-defaults-", { spec });
        const matchUpload = methodSource(resource("search"), "matchUpload");

        // 204: no Accept is derived, and no custom headers are configured.
        expect(matchUpload).not.toContain("Add default headers");
        expect(matchUpload).toContain("headers = headers.delete('Content-Type');");
        expect(requestEntries(matchUpload)).toContain("body: formData2, headers,");
    });

    it("lets a configured Content-Type default win over the derived one, whatever its spelling", async () => {
        const { output, resource } = await generate("hr-query-custom-content-type-", {
            spec,
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                customHeaders: { "content-type": "application/vnd.search+json" },
            },
        });
        const queryAnything = methodSource(resource("search"), "queryAnything");

        expect(queryAnything).toContain("'content-type': 'application/vnd.search+json'");
        expect(queryAnything).not.toContain("'Content-Type': 'application/json'");

        expectGeneratedCodeCompiles(output, "httpResource output");
    });
});
