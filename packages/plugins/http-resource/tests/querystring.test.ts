import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";
import { HttpResourcePlugin } from "../src";

/**
 * `in: querystring` parameters in resources (#136): the same arguments as in
 * the service, each one signal-or-value and read inside the request function,
 * so changing one re-sends the request.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

it("generates querystring parameters as signal-aware resource arguments", async () => {
    const output = outputDirs.create("hr-querystring-");
    await generateFromConfig({
        input: fixturePath("openapi-3.2"),
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: true },
        plugins: [HttpResourcePlugin],
    });
    const products = readFileSync(join(output, "resources", "products.resource.ts"), "utf8");

    // Form-encoded: ordinary query parameters, built into HttpParams.
    const filterProducts = methodSource(products, "filterProducts");
    expect(filterProducts).toMatch(
        /^ {4}filterProducts\(text: Signal<string> \| string, maxPrice\?: Signal<number \| undefined> \| number,/,
    );
    expect(filterProducts).toContain("const maxPriceValue = typeof maxPrice === 'function' ? maxPrice() : maxPrice;");
    expect(filterProducts).toContain("params = HttpParamsBuilder.addToHttpParams(params, maxPriceValue, 'max-price');");
    expect(filterProducts).toContain("url: `${this.basePath}/products/filter`,");

    // JSON, in one piece: read once, then tested and encoded.
    const matchProducts = methodSource(products, "matchProducts");
    expect(matchProducts).toMatch(
        /^ {4}matchProducts\(criteria\?: Signal<ProductSearch \| undefined> \| ProductSearch, resourceOptions\?:/,
    );
    expect(matchProducts).toContain("const criteriaValue = typeof criteria === 'function' ? criteria() : criteria;");
    expect(matchProducts).toContain(
        "url: `${this.basePath}/products/match${criteriaValue === undefined ? '' : '?' + " +
            "encodeURIComponent(JSON.stringify(criteriaValue))}`,",
    );
    expect(matchProducts.match(/typeof criteria === 'function'/g)).toHaveLength(1);
    // No key=value pairs: no params entry in the request.
    expect(matchProducts).not.toContain("HttpParams");

    const selectProducts = methodSource(products, "selectProducts");
    expect(selectProducts).toMatch(/^ {4}selectProducts\(selector: Signal<string> \| string, resourceOptions\?:/);
    expect(selectProducts).toContain("url: `${this.basePath}/products/select?${encodeURIComponent(selectorValue)}`,");

    expectGeneratedCodeCompiles(output, "httpResource output");
});
