import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { afterAll, expect, it } from "vitest";
import { expectGeneratedCodeCompiles } from "@ng-openapi/testing";
import { generateFromConfig, InvalidIdentifierError } from "ng-openapi";
import { HttpResourcePlugin } from "../src";

/**
 * Regression coverage for #125 on the plugin side: resources group operations
 * by tag and name their files from the controller name independently of the
 * core service generator, so both paths need the sanitized conversion.
 */

// Must live outside node_modules: the generator resolves auto-imports through
// the TypeScript language service, which ignores files under node_modules.
const tmpRoot = join(process.cwd(), "tmp", "ng-openapi-tests");
mkdirSync(tmpRoot, { recursive: true });
const tempDirs: string[] = [];

afterAll(() => {
    for (const dir of tempDirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            // best-effort cleanup
        }
    }
});

it("generates resources from tags and operationIds that are not identifiers (#125)", async () => {
    const output = mkdtempSync(join(tmpRoot, "hr-names-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    writeFileSync(
        input,
        JSON.stringify({
            swagger: "2.0",
            info: { title: "t", version: "1.0.0" },
            basePath: "/api",
            paths: {
                "/groups/{group_id}/": {
                    parameters: [{ name: "group_id", in: "path", required: true, type: "string" }],
                    get: {
                        tags: ["Groups (yes)"],
                        operationId: "groups_{group_id}_read",
                        responses: { "200": { description: "OK", schema: { type: "string" } } },
                    },
                },
            },
        }),
    );

    await generateFromConfig({
        input,
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: true },
        plugins: [HttpResourcePlugin],
    });

    const resource = readFileSync(join(output, "resources", "groupsYes.resource.ts"), "utf8");
    expect(resource).toContain("export class GroupsYesResource");
    expect(resource).toContain("groupsGroupIdRead(");

    // The barrel re-derives class names from file names; a divergence between
    // the two would surface here as a broken export.
    expect(readFileSync(join(output, "resources", "index.ts"), "utf8")).toContain(
        `export { GroupsYesResource } from "./groupsYes.resource";`,
    );

    // This PR reshapes the resource signature, and nothing else in a default
    // run typechecks plugin output — compile-check.test.ts is env-gated.
    expectGeneratedCodeCompiles(output, "httpResource output");
});

it("surfaces a generator failure instead of resolving successfully", async () => {
    const output = mkdtempSync(join(tmpRoot, "hr-error-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            paths: {
                "/groups": {
                    get: { tags: ["Groups"], operationId: "x_get", responses: { "200": { description: "OK" } } },
                },
            },
        }),
    );

    // The resource files were generated inside a `Promise.all` over a
    // block-bodied arrow that returned nothing, so every rejection — including
    // this one — escaped as an unhandled rejection while generateFromConfig
    // resolved and the CLI reported success.
    await expect(
        generateFromConfig({
            input,
            output,
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: false,
                customizeMethodName: () => "groups{x}Delete",
            },
            plugins: [HttpResourcePlugin],
        }),
    ).rejects.toBeInstanceOf(InvalidIdentifierError);

    // A failed run must not leave a barrel exporting a file it never wrote.
    expect(existsSync(join(output, "resources", "index.ts"))).toBe(false);
});

it("keeps signal-aware query params and their derived locals distinct", async () => {
    const output = mkdtempSync(join(tmpRoot, "hr-collide-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            paths: {
                "/search": {
                    get: {
                        tags: ["Search"],
                        operationId: "search",
                        parameters: [
                            // Collide with each other, with the plugin's own
                            // parameter, and with the `<id>Value` temp the
                            // signal-aware block declares.
                            { name: "filter[name]", in: "query", schema: { type: "string" } },
                            { name: "filter.name", in: "query", schema: { type: "string" } },
                            { name: "request-options", in: "query", schema: { type: "string" } },
                            { name: "foo", in: "query", schema: { type: "string" } },
                            { name: "fooValue", in: "query", schema: { type: "string" } },
                        ],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        }),
    );

    await generateFromConfig({
        input,
        output,
        // generateServices: true — the resource imports ../tokens and
        // ../utils/http-params-builder, which only the core client emits.
        options: { dateType: "string", enumStyle: "union", generateServices: true },
        plugins: [HttpResourcePlugin],
    });

    const resource = readFileSync(join(output, "resources", "search.resource.ts"), "utf8");
    // Every wire name still reaches the request, each from its own argument.
    expect(resource).toContain("params, filterNameValue, 'filter[name]'");
    expect(resource).toContain("params, filterName2Value, 'filter.name'");
    expect(resource).toContain("params, requestOptions2Value, 'request-options'");
    // The plugin's own parameters survive.
    expect(resource).toContain("requestOptions?: Omit<HttpResourceRequest");
    // The parameters keep their natural names, so `foo`'s derived temp is the
    // one that yields: it must not shadow the `fooValue` parameter.
    expect(resource).toContain("const fooValue2 = typeof foo === 'function' ? foo() : foo;");
    expect(resource).toContain("const fooValueValue = typeof fooValue === 'function'");
    expect(resource).toContain("params, fooValue2, 'foo'");
    expect(resource).toContain("params, fooValueValue, 'fooValue'");

    expectGeneratedCodeCompiles(output, "httpResource output");
});

it("compiles httpResource output when no services are generated", async () => {
    const output = mkdtempSync(join(tmpRoot, "hr-only-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            paths: {
                "/things": {
                    get: {
                        tags: ["Things"],
                        operationId: "listThings",
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        }),
    );

    // The resources import ../tokens and ../utils/http-params-builder, which
    // used to be emitted only when generateServices was on — so plugin-only
    // output referenced files that were never written, and @ts-nocheck hid it.
    await generateFromConfig({
        input,
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: false },
        plugins: [HttpResourcePlugin],
    });

    expectGeneratedCodeCompiles(output, "plugin-only httpResource output");
});

it("does not reserve a request-body name the resource never binds", async () => {
    const output = mkdtempSync(join(tmpRoot, "hr-body-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    // A GET carrying a JSON body is legal in OAS3. The resource emits no body
    // parameter, so reserving "requestBody" for it would rename an unrelated
    // query parameter and warn about a parameter that does not exist.
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            paths: {
                "/search": {
                    get: {
                        tags: ["Search"],
                        operationId: "search",
                        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
                        parameters: [{ name: "request_body", in: "query", schema: { type: "string" } }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        }),
    );

    const result = await generateFromConfig({
        input,
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: true },
        plugins: [HttpResourcePlugin],
    });

    const resource = readFileSync(join(output, "resources", "search.resource.ts"), "utf8");
    expect(resource).toContain("search(requestBody");
    expect(resource).not.toContain("requestBody2");
    // The core service does bind a body, so it legitimately renames there.
    expect(result.warnings.filter((w) => w.includes("resource method itself"))).toEqual([]);
});
