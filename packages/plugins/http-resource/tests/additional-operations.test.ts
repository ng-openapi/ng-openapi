import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";
import { HttpResourcePlugin } from "../src";

/**
 * A resource re-sends its request whenever a signal it read changes, so only
 * the methods known to be safe get one. Nothing says that about a method
 * declared under `additionalOperations` (#136).
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

it("generates no resource for a method declared under additionalOperations", async () => {
    const output = outputDirs.create("hr-additional-ops-");
    await generateFromConfig({
        input: fixturePath("openapi-3.2"),
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: true },
        plugins: [HttpResourcePlugin],
    });

    const service = readFileSync(join(output, "services", "products.service.ts"), "utf8");
    const resource = readFileSync(join(output, "resources", "products.resource.ts"), "utf8");

    // The service has them; the resource class of the same controller does not.
    for (const method of ["copyProduct", "productsProductIdPurge"]) {
        expect(service).toContain(`    ${method}(`);
        expect(resource).not.toContain(`${method}(`);
    }
    // GET and QUERY operations of that controller are still there.
    expect(resource).toContain("    listProducts(");
    expect(resource).toContain("    searchProducts(");

    expectGeneratedCodeCompiles(output, "httpResource output");
});
