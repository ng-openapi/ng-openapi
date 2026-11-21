import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";
import { HttpResourcePlugin } from "../src";

/**
 * Sequential responses in resources (#136). A resource holds one value at a
 * time, so a streamed response gets none; a sequential response that is
 * declared complete is one value, and gets a resource that parses it.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

async function generate(prefix: string, generateServices: boolean) {
    const output = outputDirs.create(prefix);
    const result = await generateFromConfig({
        input: fixturePath("openapi-3.2"),
        output,
        options: { dateType: "string", enumStyle: "union", generateServices },
        plugins: [HttpResourcePlugin],
    });
    const orders = readFileSync(join(output, "resources", "orders.resource.ts"), "utf8");
    const aboutStreams = result.warnings.filter((warning) => warning.includes("No resource is generated"));
    return { output, orders, aboutStreams };
}

describe("httpResource and sequential responses (#136)", () => {
    it("generates no resource for a streamed response, and points at the service method", async () => {
        const { output, orders, aboutStreams } = await generate("hr-streams-", true);

        // GETs both, but a series of values is not what a resource holds.
        expect(orders).not.toContain("streamOrders(");
        expect(orders).not.toContain("watchOrderEvents(");
        expect(aboutStreams).toEqual([
            "No resource is generated for streamOrders ((GET) /orders/feed): its response is a stream of items " +
                "(`itemSchema`), and an httpResource holds one value, not a series. Use the generated service " +
                "method, which emits each item as it arrives.",
            expect.stringContaining("No resource is generated for watchOrderEvents ((GET) /orders/events)"),
        ]);
        // The service has them.
        const service = readFileSync(join(output, "services", "orders.service.ts"), "utf8");
        expect(service).toContain("    streamOrders(");

        expectGeneratedCodeCompiles(output, "httpResource output");
    });

    it("says how to get the method when services are not generated", async () => {
        const { output, aboutStreams } = await generate("hr-streams-plugin-only-", false);

        expect(aboutStreams[0]).toContain(
            "Enable `generateServices` to get it as a service method that emits each item.",
        );
        expectGeneratedCodeCompiles(output, "plugin-only httpResource output");
    });

    it("parses a sequential response that is declared complete into its array", async () => {
        const { orders } = await generate("hr-sequence-complete-", true);
        const listArchivedOrders = methodSource(orders, "listArchivedOrders");

        expect(listArchivedOrders).toMatch(
            /^ {4}listArchivedOrders\(resourceOptions\?: HttpResourceOptions<Array<Order>, unknown>,/,
        );
        expect(listArchivedOrders).toContain("return httpResource.text(() => {");
        // The caller's options come last: a parse of their own replaces this one.
        expect(listArchivedOrders).toContain(
            "}, { parse: (text: string): Array<Order> => parseJsonLines(text), ...resourceOptions });",
        );
        expect(orders).toContain(`import { parseJsonLines } from "../utils/http-stream";`);
    });
});
