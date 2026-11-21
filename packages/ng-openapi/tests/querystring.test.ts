import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";
import { ZodPlugin } from "@ng-openapi/zod";

/**
 * OpenAPI 3.2's `in: querystring` parameter (#136): one parameter that is the
 * entire query string. Form-encoded, its properties are ordinary key=value
 * pairs and are generated as query parameters; as JSON or text it is one
 * argument sent in one piece. The golden suite snapshots the same fixture;
 * these tests say what about it matters, and that it compiles.
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
    const read = (...path: string[]) => readFileSync(join(output, ...path), "utf8");
    return { output, result, read, service: (name: string) => read("services", `${name}.service.ts`) };
}

const aboutQueryString = (warnings: readonly string[]) => warnings.filter((warning) => warning.includes("querystring"));

describe("in: querystring parameters (#136)", () => {
    it("generates a form-encoded one as ordinary query parameters, one argument per property", async () => {
        const { output, result, read, service } = await generate("querystring-form-", { plugins: [ZodPlugin] });
        const filterProducts = methodSource(service("products"), "filterProducts");

        // `text` is required: the parameter is, and its schema lists it.
        expect(filterProducts).toMatch(
            /^ {4}filterProducts\(text: string, maxPrice\?: number, categories\?: Array<string>, sort\?: ProductSort, observe\?:/,
        );
        expect(filterProducts).toContain("const url = `${this.basePath}/products/filter`;");
        // The wire name stays in the literal; the identifier is camelCased.
        expect(filterProducts).toContain("params = HttpParamsBuilder.addToHttpParams(params, maxPrice, 'max-price');");
        expect(filterProducts).toMatch(/observe,\s+headers,\s+params,/);

        // The zod plugin validates them as the query parameters they are.
        const validators = read("validators", "products.validator.ts");
        expect(validators).toMatch(/export const filterProductsQueryParams = z\.object\(\{\s+"text": z\.string\(\),/);

        expect(aboutQueryString(result.warnings)).toEqual([]);
        expectGeneratedCodeCompiles(output);
    });

    it("sends a JSON one as the whole query string, and nothing when it is left out", async () => {
        const { service } = await generate("querystring-json-");
        const matchProducts = methodSource(service("products"), "matchProducts");

        expect(matchProducts).toMatch(/^ {4}matchProducts\(criteria\?: ProductSearch, observe\?:/);
        expect(matchProducts).toContain(
            "const url = `${this.basePath}/products/match${criteria === undefined ? '' : '?' + " +
                "encodeURIComponent(JSON.stringify(criteria))}`;",
        );
        // One piece: there are no key=value pairs to build.
        expect(matchProducts).not.toContain("HttpParams");
        expect(matchProducts).not.toMatch(/\bparams,/);
    });

    it("sends a plain-string one percent-encoded, as it is", async () => {
        const { service } = await generate("querystring-text-");
        const selectProducts = methodSource(service("products"), "selectProducts");

        expect(selectProducts).toMatch(/^ {4}selectProducts\(selector: string, observe\?:/);
        expect(selectProducts).toContain(
            "const url = `${this.basePath}/products/select?${encodeURIComponent(selector)}`;",
        );
    });

    it("puts either kind into the request object with useSingleRequestParameter", async () => {
        const { output, read, service } = await generate("querystring-single-param-", {
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                useSingleRequestParameter: true,
            },
        });
        const requestParams = read("models", "request-params.ts");
        const products = service("products");

        expect(requestParams).toMatch(
            /export interface FilterProductsParams \{\s+text: string;\s+maxPrice\?: number;\s+categories\?: Array<string>;\s+sort\?: ProductSort;\s+\}/,
        );
        expect(requestParams).toMatch(/export interface MatchProductsParams \{\s+criteria\?: ProductSearch;\s+\}/);
        expect(requestParams).toMatch(/export interface SelectProductsParams \{\s+selector: string;\s+\}/);

        const filterProducts = methodSource(products, "filterProducts");
        expect(filterProducts).toMatch(/^ {4}filterProducts\(request: FilterProductsParams, observe\?:/);
        expect(filterProducts).toContain("const { text, maxPrice, categories, sort } = request;");

        // Every property is optional, so the request object is too.
        const matchProducts = methodSource(products, "matchProducts");
        expect(matchProducts).toMatch(/^ {4}matchProducts\(request\?: MatchProductsParams, observe\?:/);
        expect(matchProducts).toContain("const { criteria } = request ?? {};");
        expect(matchProducts).toContain("encodeURIComponent(JSON.stringify(criteria))");

        const selectProducts = methodSource(products, "selectProducts");
        expect(selectProducts).toMatch(/^ {4}selectProducts\(request: SelectProductsParams, observe\?:/);
        expect(selectProducts).toContain("const { selector } = request;");

        expectGeneratedCodeCompiles(output);
    });
});

describe("in: querystring parameters that are optional, colliding or not generated", () => {
    const ok = { "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } };
    const form = (schema: object) => ({ "application/x-www-form-urlencoded": { schema } });
    const fields = {
        type: "object",
        required: ["q"],
        properties: { q: { type: "string" }, page: { type: "integer" } },
    };
    const spec = {
        openapi: "3.2.0",
        info: { title: "Querystrings", version: "1.0.0" },
        paths: {
            // Not required: the whole query string may be left out, so no
            // single property can be demanded.
            "/optional": {
                get: {
                    operationId: "searchOptional",
                    tags: ["Search"],
                    parameters: [{ name: "filter", in: "querystring", content: form(fields) }],
                    responses: ok,
                },
            },
            // A name the method already binds, and a path parameter beside it.
            "/items/{id}": {
                get: {
                    operationId: "selectItem",
                    tags: ["Search"],
                    parameters: [
                        { name: "id", in: "path", required: true, schema: { type: "string" } },
                        { name: "options", in: "querystring", required: true, content: { "text/plain": {} } },
                    ],
                    responses: ok,
                },
            },
            // OpenAPI forbids `in: query` next to it. Form-encoded, both are
            // key=value pairs and both are sent; `page` is sent once.
            "/merged": {
                get: {
                    operationId: "searchMerged",
                    tags: ["Search"],
                    parameters: [
                        { name: "page", in: "query", schema: { type: "integer" } },
                        { name: "filter", in: "querystring", required: true, content: form(fields) },
                    ],
                    responses: ok,
                },
            },
            // In one piece, there is nowhere to put the query parameter.
            "/clash": {
                get: {
                    operationId: "searchClash",
                    tags: ["Search"],
                    parameters: [
                        { name: "page", in: "query", schema: { type: "integer" } },
                        { name: "criteria", in: "querystring", content: { "application/json": { schema: fields } } },
                    ],
                    responses: ok,
                },
            },
            "/unlisted": {
                get: {
                    operationId: "searchUnlisted",
                    tags: ["Search"],
                    parameters: [
                        {
                            name: "filter",
                            in: "querystring",
                            content: form({ type: "object", additionalProperties: { type: "string" } }),
                        },
                    ],
                    responses: ok,
                },
            },
        },
    };

    it("makes every property optional when the parameter itself is", async () => {
        const { service } = await generate("querystring-optional-", { spec });
        expect(methodSource(service("search"), "searchOptional")).toMatch(
            /^ {4}searchOptional\(q\?: string, page\?: number, observe\?:/,
        );
    });

    it("names the argument after the parameter, clear of what the method binds", async () => {
        const { output, result, service } = await generate("querystring-names-", { spec });
        const selectItem = methodSource(service("search"), "selectItem");

        // `options` is the method's own trailing parameter.
        expect(selectItem).toMatch(/^ {4}selectItem\(id: string, options2: string, observe\?:/);
        expect(selectItem).toContain("const url = `${this.basePath}/items/${id}?${encodeURIComponent(options2)}`;");
        expect(result.warnings).toContainEqual(
            expect.stringContaining('Parameter "options" of selectItem ((GET) /items/{id}) is exposed as "options2"'),
        );

        expectGeneratedCodeCompiles(output);
    });

    it("sends a form-encoded one next to query parameters, each key once", async () => {
        const { service } = await generate("querystring-merged-", { spec });
        const searchMerged = methodSource(service("search"), "searchMerged");

        expect(searchMerged).toMatch(/^ {4}searchMerged\(q: string, page\?: number, observe\?:/);
        expect(searchMerged.match(/addToHttpParams\(params, page, 'page'\)/g)).toHaveLength(1);
    });

    it("skips what it cannot generate, and says what the method then takes", async () => {
        const { result, service } = await generate("querystring-skipped-", { spec });
        const search = service("search");

        expect(methodSource(search, "searchClash")).toMatch(/^ {4}searchClash\(page\?: number, observe\?:/);
        expect(methodSource(search, "searchUnlisted")).toMatch(/^ {4}searchUnlisted\(observe\?:/);
        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(aboutQueryString(result.warnings)).toEqual([
            expect.stringContaining(
                '`in: querystring` parameter "criteria" of searchClash ((GET) /clash) was skipped: the operation ' +
                    'also declares `in: query` parameters ("page")',
            ),
            expect.stringContaining(
                '`in: querystring` parameter "filter" of searchUnlisted ((GET) /unlisted) was skipped: its form ' +
                    "schema lists no top-level `properties`",
            ),
        ]);
    });
});
