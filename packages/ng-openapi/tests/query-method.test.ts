import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";
import { ZodPlugin } from "@ng-openapi/zod";

/**
 * The HTTP QUERY method (#136): OpenAPI 3.2's `query` path-item field. The
 * golden suite snapshots the output of the same fixture; these tests say what
 * about it matters, and that it compiles.
 */

// The Angular the generator finds is pinned rather than read from this repo's
// node_modules: the warning below depends on it, and a test that followed the
// installed version would stop testing anything the day the repo upgrades.
const workspace = vi.hoisted(() => ({ angularVersion: undefined as string | undefined }));
vi.mock("../src/lib/core/angular-version", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/lib/core/angular-version")>()),
    detectAngularCoreVersion: () => workspace.angularVersion,
}));
beforeEach(() => {
    workspace.angularVersion = "21.2.13";
});

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

/** The expression a generated method passes as `body` to `request()`, if any. */
function sentBody(method: string): string | undefined {
    return /\.request\('\w+', url, \{\s+body: ([^,\n]+),/.exec(method)?.[1];
}

async function generate(prefix: string, config: Partial<GeneratorConfig> = {}) {
    const output = outputDirs.create(prefix);
    const result = await generateFromConfig({
        input: fixturePath("openapi-3.2"),
        output,
        ...config,
        options: { dateType: "string", enumStyle: "union", generateServices: true, ...config.options },
    });
    const service = (name: string) => readFileSync(join(output, "services", `${name}.service.ts`), "utf8");
    return { output, result, service };
}

const aboutQuery = (warnings: readonly string[]) => warnings.filter((warning) => warning.includes("HTTP QUERY method"));

describe("HTTP QUERY operations (#136)", () => {
    it("generates a service method per QUERY operation, sent through request('query')", async () => {
        const { output, service } = await generate("query-method-", { plugins: [ZodPlugin] });
        const products = service("products");

        const searchProducts = methodSource(products, "searchProducts");
        expect(searchProducts).toMatch(
            /^ {4}searchProducts\(productSearch: ProductSearch, limit\?: number, cursor\?: string, observe\?:/,
        );
        expect(searchProducts).toContain("request('query', url, {");
        expect(searchProducts).toContain("headers = headers.set('Content-Type', 'application/json');");
        expect(sentBody(searchProducts)).toBe("productSearch");
        // A QUERY keeps its query parameters next to the body.
        expect(searchProducts).toMatch(/observe,\s+headers,\s+params,/);

        // Next to an ordinary GET of the same controller, which is unchanged.
        expect(methodSource(products, "listProducts")).toContain("request('get', url, {");

        expectGeneratedCodeCompiles(output);
    });

    it("sends each body the way the other methods do", async () => {
        const { service } = await generate("query-bodies-");

        // An optional JSON body: omitted, it reaches HttpClient as `undefined`.
        const related = methodSource(service("products"), "productsProductIdRelatedQuery");
        expect(related).toMatch(
            /^ {4}productsProductIdRelatedQuery\(productId: string, relatedFilter\?: RelatedFilter,/,
        );
        expect(sentBody(related)).toBe("relatedFilter");

        const searchOrders = methodSource(service("orders"), "searchOrders");
        expect(searchOrders).toMatch(
            /^ {4}searchOrders\(status: OrderStatus, customerId\?: string, tags\?: Array<string>, observe\?:/,
        );
        expect(searchOrders).toContain("formBody.append('customer-id', String(customerId));");
        expect(searchOrders).toContain("headers.set('Content-Type', 'application/x-www-form-urlencoded')");
        expect(sentBody(searchOrders)).toBe("formBody.toString()");

        const matchImages = methodSource(service("images"), "matchImages");
        expect(matchImages).toContain("formData.append('image', image);");
        expect(matchImages).toContain("headers = headers.delete('Content-Type');");
        expect(sentBody(matchImages)).toBe("formData");
    });

    it("sends no body, and sets no Content-Type, for a QUERY that declares none", async () => {
        const { service } = await generate("query-bodyless-");
        const featured = methodSource(service("products"), "queryFeaturedProducts");

        expect(featured).toMatch(/^ {4}queryFeaturedProducts\(observe\?:/);
        expect(featured).toContain("request('query', url, {");
        expect(sentBody(featured)).toBeUndefined();
        expect(featured).not.toContain("body:");
        expect(featured).not.toContain("Content-Type");
    });

    it("pins the response type of a QUERY that returns a file", async () => {
        const { service } = await generate("query-blob-");
        const exportOrders = methodSource(service("orders"), "exportOrders");

        expect(exportOrders).toContain("responseType: 'blob'");
        expect(sentBody(exportOrders)).toBe("orderExportRequest");
    });

    it("warns once, without blocking, when the workspace's Angular predates QUERY support", async () => {
        workspace.angularVersion = "22.2.7";
        const { output, result } = await generate("query-warning-");

        expect(aboutQuery(result.warnings)).toEqual([
            "6 operations (the first is searchProducts ((QUERY) /products/search)) use the HTTP QUERY method, " +
                "which Angular's HttpClient supports from 22.3 — found @angular/core 22.2.7 in this workspace. " +
                "The generated code still compiles and sends the request there, but HttpClient treats it as a " +
                "mutation: it attaches the XSRF token to it, and server-side rendering does not reuse its " +
                "response during hydration.",
        ]);
        // Generation went ahead: the warning is advice, not a refusal.
        expect(result.filesWritten.length).toBeGreaterThan(0);
        expectGeneratedCodeCompiles(output);
    });

    it.each(["22.3.0", "23.0.0"])("has nothing to say on Angular %s", async (angularVersion) => {
        workspace.angularVersion = angularVersion;
        const { result } = await generate("query-supported-");
        expect(aboutQuery(result.warnings)).toEqual([]);
    });

    it("stays silent when no Angular can be detected in the workspace", async () => {
        workspace.angularVersion = undefined;
        const { result } = await generate("query-undetected-");
        expect(aboutQuery(result.warnings)).toEqual([]);
    });

    it("says nothing about Angular for a run that emits no client, however old it is", async () => {
        const { result } = await generate("query-types-only-", {
            options: { dateType: "string", enumStyle: "union", generateServices: false },
        });
        expect(aboutQuery(result.warnings)).toEqual([]);
    });
});
