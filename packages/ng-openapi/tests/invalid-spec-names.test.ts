import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles } from "@ng-openapi/testing";
import { generateFromConfig, InvalidIdentifierError } from "ng-openapi";

/**
 * Regression coverage for #125: `operationId`s and tags are free-form text in a
 * valid OpenAPI document, so anything the generator derives an identifier or a
 * file name from has to be sanitized. Before the fix these specs died inside
 * ts-morph ("A child syntax list was expected") after emitting a class named
 * `Groups(yes)Service` with a method named `groups{groupId}Delete`.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

/** The spec from the issue, plus a tag and an operationId per hostile shape. */
const HOSTILE_SPEC = {
    swagger: "2.0",
    info: { title: "Operation ID reproduction", version: "1.0.0" },
    basePath: "/api",
    paths: {
        "/groups/{group_id}/": {
            parameters: [{ name: "group_id", in: "path", required: true, type: "string" }],
            delete: {
                tags: ["Groups (yes)"],
                operationId: "groups_{group_id}_delete",
                responses: { "204": { description: "No content" } },
            },
        },
        "/reports": {
            get: {
                tags: ["Reports & Stats"],
                operationId: "2fa.report:list",
                parameters: [{ name: "filter[name]", in: "query", required: false, type: "string" }],
                responses: { "200": { description: "OK", schema: { type: "string" } } },
            },
        },
    },
};

/**
 * OpenAPI 3 counterpart for the shapes that only exist there. Every name here
 * is legal in a spec and illegal (or ambiguous) as a TypeScript identifier:
 * a multipart field with a dash, two query params that camelCase onto one
 * name, and one that collides with the generator's own `options` parameter.
 */
const HOSTILE_OAS3_SPEC = {
    openapi: "3.0.0",
    info: { title: "t", version: "1.0.0" },
    paths: {
        "/upload": {
            post: {
                tags: ["Files"],
                operationId: "upload",
                requestBody: {
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                properties: {
                                    "user-name": { type: "string" },
                                    file: { type: "string", format: "binary" },
                                },
                            },
                        },
                    },
                },
                responses: { "200": { description: "OK" } },
            },
        },
        "/search": {
            get: {
                tags: ["Search"],
                operationId: "search",
                parameters: [
                    { name: "filter[name]", in: "query", schema: { type: "string" } },
                    { name: "filter.name", in: "query", schema: { type: "string" } },
                    { name: "options[]", in: "query", schema: { type: "string" } },
                ],
                responses: { "200": { description: "OK" } },
            },
        },
    },
};

function writeSpec(dir: string, spec: unknown): string {
    const input = join(dir, "spec.json");
    writeFileSync(input, JSON.stringify(spec));
    return input;
}

describe("specs whose names are illegal TypeScript identifiers (#125)", () => {
    it("generates compilable services and matching barrel exports", async () => {
        const output = outputDirs.create("names-");
        await generateFromConfig({
            input: writeSpec(output, HOSTILE_SPEC),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const barrel = readFileSync(join(output, "services", "index.ts"), "utf8");
        // The barrel re-derives class names from file names, so a divergence
        // between the two would show up here as a broken export.
        expect(barrel).toContain(`export { GroupsYesService } from "./groupsYes.service";`);
        expect(barrel).toContain(`export { ReportsStatsService } from "./reportsStats.service";`);

        const groups = readFileSync(join(output, "services", "groupsYes.service.ts"), "utf8");
        expect(groups).toContain("export class GroupsYesService");
        expect(groups).toContain("groupsGroupIdDelete(");

        // A leading digit cannot start an identifier; `filter[name]` is a legal
        // OAS parameter name and must reach the signature sanitized too.
        const reports = readFileSync(join(output, "services", "reportsStats.service.ts"), "utf8");
        expect(reports).toContain("_2faReportList(");
        expect(reports).toContain("filterName");

        expectGeneratedCodeCompiles(output);
    });

    it("generates compilable request-parameter interfaces from the same names", async () => {
        const output = outputDirs.create("names-req-");
        await generateFromConfig({
            input: writeSpec(output, HOSTILE_SPEC),
            output,
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                useSingleRequestParameter: true,
            },
        });

        expectGeneratedCodeCompiles(output);
    });

    it("sanitizes multipart field names, which never reach the params generator as identifiers", async () => {
        const output = outputDirs.create("names-multipart-");
        await generateFromConfig({
            input: writeSpec(output, HOSTILE_OAS3_SPEC),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const files = readFileSync(join(output, "services", "files.service.ts"), "utf8");
        expect(files).toContain("upload(userName?: string");
        // The wire name stays intact inside the append call — only the
        // expression position gets the identifier.
        expect(files).toContain("formData.append('user-name', String(userName))");

        expectGeneratedCodeCompiles(output);
    });

    it("keeps colliding query params distinct instead of losing one", async () => {
        const output = outputDirs.create("names-collide-");
        await generateFromConfig({
            input: writeSpec(output, HOSTILE_OAS3_SPEC),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const search = readFileSync(join(output, "services", "search.service.ts"), "utf8");
        // `filter[name]` and `filter.name` both camelCase to `filterName`; each
        // must keep its own argument, or one wire param is unreachable forever.
        expect(search).toContain("params, filterName, 'filter[name]'");
        expect(search).toContain("params, filterName2, 'filter.name'");
        // `options[]` must not capture the generator's own `options` parameter,
        // which carries headers/reportProgress/withCredentials.
        expect(search).toContain("params, options2, 'options[]'");
        expect(search).toContain("options?: RequestOptions<");
        expect(search).toContain("headers = new HttpHeaders(options?.headers)");

        expectGeneratedCodeCompiles(output);
    });

    it("warns when two distinct tags normalize onto one controller", async () => {
        const output = outputDirs.create("names-tagmerge-");
        const result = await generateFromConfig({
            input: writeSpec(
                output,
                {
                    openapi: "3.0.0",
                    info: { title: "t", version: "1.0.0" },
                    paths: {
                        "/a": { get: { tags: ["Groups (yes)"], operationId: "a_get", responses: { "200": { description: "OK" } } } },
                        "/b": { get: { tags: ["Groups-yes"], operationId: "b_get", responses: { "200": { description: "OK" } } } },
                    },
                },
            ),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        // Merging beats dropping, but it must not be silent.
        const merges = result.warnings.filter((warning) => warning.includes("map to the controller"));
        expect(merges).toHaveLength(1); // once, not once per generator
        expect(merges[0]).toMatch(/"Groups \(yes\)" and "Groups-yes" all map to the controller "GroupsYes"/);
    });

    it("rejects `constructor`, which is a valid identifier but not a usable method name", async () => {
        const output = outputDirs.create("names-ctor-");

        await expect(
            generateFromConfig({
                input: writeSpec(output, HOSTILE_SPEC),
                output,
                options: {
                    dateType: "string",
                    enumStyle: "union",
                    generateServices: true,
                    customizeMethodName: () => "constructor",
                },
            }),
        ).rejects.toBeInstanceOf(InvalidIdentifierError);
    });

    it("rejects a customizeMethodName result that is not an identifier", async () => {
        const output = outputDirs.create("names-hook-");

        await expect(
            generateFromConfig({
                input: writeSpec(output, HOSTILE_SPEC),
                output,
                options: {
                    dateType: "string",
                    enumStyle: "union",
                    generateServices: true,
                    // The hook replaces the built-in sanitization, so returning
                    // the raw operationId reintroduces the invalid name.
                    customizeMethodName: (operationId) => operationId,
                },
            }),
        ).rejects.toBeInstanceOf(InvalidIdentifierError);
    });

    it("accepts a customizeMethodName result that is an identifier", async () => {
        const output = outputDirs.create("names-hook-ok-");
        await generateFromConfig({
            input: writeSpec(output, HOSTILE_SPEC),
            output,
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                customizeMethodName: (operationId) => operationId.replace(/[^a-zA-Z]/g, ""),
            },
        });

        const groups = readFileSync(join(output, "services", "groupsYes.service.ts"), "utf8");
        expect(groups).toContain("groupsgroupiddelete(");
        expectGeneratedCodeCompiles(output);
    });
});

describe("argument names that only one code path produces", () => {
    /**
     * urlencoded bodies take a different branch from multipart in the body
     * generator, so sanitizing only the multipart branch left this broken.
     */
    it("sanitizes x-www-form-urlencoded field names", async () => {
        const output = outputDirs.create("names-urlenc-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/login": {
                        post: {
                            tags: ["Auth"],
                            operationId: "login",
                            requestBody: {
                                content: {
                                    "application/x-www-form-urlencoded": {
                                        schema: {
                                            type: "object",
                                            properties: {
                                                "grant-type": { type: "string" },
                                                scopes: { type: "array", items: { type: "string" } },
                                            },
                                        },
                                    },
                                },
                            },
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const auth = readFileSync(join(output, "services", "auth.service.ts"), "utf8");
        expect(auth).toContain("login(grantType?: string");
        expect(auth).toContain("formBody.append('grant-type', String(grantType))");
        expectGeneratedCodeCompiles(output);
    });

    /**
     * `operationId: "constructor"` is a valid identifier, so it passes every
     * name check and only fails inside ts-morph. The derived path sanitizes it
     * rather than rejecting it — the spec is valid.
     */
    it("renames an operation whose derived name would be `constructor`", async () => {
        const output = outputDirs.create("names-derived-ctor-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/x": {
                        get: { tags: ["X"], operationId: "constructor", responses: { "200": { description: "OK" } } },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expect(readFileSync(join(output, "services", "x.service.ts"), "utf8")).toContain("_constructor(");
        expectGeneratedCodeCompiles(output);
    });

    /**
     * Wire names are untrusted spec text. Indexing a plain object with them
     * resolves `constructor`/`toString` off Object.prototype, which dropped the
     * other parameters and interpolated a function into the emitted source.
     */
    it("handles wire names that collide with Object.prototype members", async () => {
        const output = outputDirs.create("names-proto-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/probe": {
                        get: {
                            tags: ["Probe"],
                            operationId: "probe",
                            parameters: [
                                { name: "constructor", in: "query", schema: { type: "string" } },
                                { name: "toString", in: "query", schema: { type: "string" } },
                                { name: "__proto__", in: "query", schema: { type: "string" } },
                                { name: "normal", in: "query", schema: { type: "string" } },
                            ],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const probe = readFileSync(join(output, "services", "probe.service.ts"), "utf8");
        for (const wireName of ["constructor", "toString", "__proto__", "normal"]) {
            expect(probe, `${wireName} lost`).toContain(`'${wireName}');`);
        }
        expect(probe).not.toContain("[native code]");
        expectGeneratedCodeCompiles(output);
    });
});
