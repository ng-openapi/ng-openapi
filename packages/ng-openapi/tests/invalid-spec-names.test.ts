import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles } from "@ng-openapi/testing";
import {
    DuplicateGeneratedNameError,
    generateFromConfig,
    InvalidIdentifierError,
    UnresolvedPathTemplateError,
} from "ng-openapi";
import { HttpResourcePlugin } from "@ng-openapi/http-resource";
import { ZodPlugin } from "@ng-openapi/zod";

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
            // Three generators each group by controller independently, so this
            // fixture is what makes the once-per-spec dedupe observable at all.
            plugins: [HttpResourcePlugin, ZodPlugin],
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

describe("names that are valid identifiers but still unusable", () => {
    /**
     * `camelCase` guarantees an identifier, which is weaker than "usable as a
     * parameter name": `class` is a legal member name but a syntax error in
     * binding position — the same ts-morph failure as #125.
     */
    it("renames reserved words used as parameters", async () => {
        const output = outputDirs.create("names-reserved-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/probe": {
                        get: {
                            tags: ["Probe"],
                            operationId: "probe",
                            parameters: ["class", "function", "new", "this", "await"].map((name) => ({
                                name,
                                in: "query",
                                schema: { type: "string" },
                            })),
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const probe = readFileSync(join(output, "services", "probe.service.ts"), "utf8");
        for (const word of ["class", "function", "new", "this", "await"]) {
            expect(probe, `${word} lost`).toContain(`'${word}');`);
            expect(probe, `${word} used as a binding`).toContain(`${word}2`);
        }
        expectGeneratedCodeCompiles(output);
    });

    /**
     * `$` is legal in an identifier and `camelCase` preserves it (OData `$top`),
     * but `$$`/`$&` are substitution patterns in a String.replace replacement.
     */
    it("handles $ in a path parameter name", async () => {
        const output = outputDirs.create("names-dollar-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/d/{a$$b}": {
                        get: {
                            tags: ["Dollar"],
                            operationId: "dollar",
                            parameters: [{ name: "a$$b", in: "path", required: true, schema: { type: "string" } }],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const dollar = readFileSync(join(output, "services", "dollar.service.ts"), "utf8");
        expect(dollar).toContain("dollar(a$$b: string");
        // Not `${a$b}`: the replacement pattern would have eaten one `$`.
        expect(dollar).toContain("${a$$b}");
        expectGeneratedCodeCompiles(output);
    });

    it("warns when a tag contains nothing usable in a name", async () => {
        const output = outputDirs.create("names-nameless-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/x": { get: { tags: ["{}"], operationId: "x_get", responses: { "200": { description: "OK" } } } },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        // Not `_.service.ts` / `_Service`, and not silent.
        expect(readFileSync(join(output, "services", "index.ts"), "utf8")).toContain("DefaultService");
        expect(result.warnings.join("\n")).toMatch(/Tag "\{\}" contains no characters usable in a name/);
    });

    it("warns when one wire name is declared in two locations", async () => {
        const output = outputDirs.create("names-merged-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/things/{id}": {
                        get: {
                            tags: ["Things"],
                            operationId: "get_thing",
                            parameters: [
                                { name: "id", in: "path", required: true, schema: { type: "string" } },
                                { name: "id", in: "query", schema: { type: "integer" } },
                            ],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expect(result.warnings.join("\n")).toMatch(/"id".*is declared in more than one location/);
    });

    it("leaves the output directory untouched when generation fails", async () => {
        const output = outputDirs.create("names-atomic-");

        await expect(
            generateFromConfig({
                input: writeSpec(output, HOSTILE_SPEC),
                output,
                options: {
                    dateType: "string",
                    enumStyle: "union",
                    generateServices: true,
                    customizeMethodName: () => "not an identifier",
                },
            }),
        ).rejects.toBeInstanceOf(InvalidIdentifierError);

        // Only the spec we wrote; no half-generated client, no barrel.
        expect(readdirSync(output)).toEqual(["spec.json"]);
    });
});

describe("emitted string literals and path templates", () => {
    it("substitutes a repeated path placeholder everywhere it appears", async () => {
        const output = outputDirs.create("names-repeat-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/a/{id}/b/{id}": {
                        get: {
                            tags: ["Repeat"],
                            operationId: "repeat",
                            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const repeat = readFileSync(join(output, "services", "repeat.service.ts"), "utf8");
        // `replace` with a string pattern took only the first, shipping a literal
        // "{id}" in every request URL. That compiles, so no compile assertion or
        // golden fixture could see it.
        expect(repeat).toContain("`${this.basePath}/a/${id}/b/${id}`");
        expect(repeat).not.toContain("/b/{id}");
        expectGeneratedCodeCompiles(output);
    });

    it("rejects a path placeholder with no declared parameter", async () => {
        const output = outputDirs.create("names-undeclared-");

        await expect(
            generateFromConfig({
                input: writeSpec(output, {
                    openapi: "3.0.0",
                    info: { title: "t", version: "1.0.0" },
                    paths: {
                        "/a/{id}": {
                            get: { tags: ["U"], operationId: "u", responses: { "200": { description: "OK" } } },
                        },
                    },
                }),
                output,
                options: { dateType: "string", enumStyle: "union", generateServices: true },
            }),
        ).rejects.toBeInstanceOf(UnresolvedPathTemplateError);
    });

    it("escapes quotes and backslashes in wire names", async () => {
        const output = outputDirs.create("names-quotes-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/q": {
                        get: {
                            tags: ["Quotes"],
                            operationId: "quotes",
                            parameters: [
                                // A quote closed the literal (a syntax error); a
                                // backslash was worse, being silent — the wrong
                                // name went on the wire and still compiled.
                                { name: "it's", in: "query", schema: { type: "string" } },
                                { name: "back\\slash", in: "query", schema: { type: "string" } },
                            ],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const quotes = readFileSync(join(output, "services", "quotes.service.ts"), "utf8");
        expect(quotes).toContain("\\'");
        expect(quotes).toContain("'back\\\\slash'");
        expectGeneratedCodeCompiles(output);
    });

    it("keeps a backtick or an interpolation in the path from breaking the literal", async () => {
        const output = outputDirs.create("names-template-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/tpl/`x/${y}": {
                        get: {
                            tags: ["Tpl"],
                            operationId: "tpl",
                            parameters: [{ name: "y", in: "path", required: true, schema: { type: "string" } }],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expectGeneratedCodeCompiles(output);
    });
});

describe("what generation says out loud", () => {
    it("warns about a required header parameter it does not bind", async () => {
        const output = outputDirs.create("names-header-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/h": {
                        get: {
                            tags: ["Head"],
                            operationId: "headOp",
                            parameters: [
                                { name: "X-Trace-Id", in: "header", required: true, schema: { type: "string" } },
                                { name: "X-Optional", in: "header", schema: { type: "string" } },
                            ],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expect(result.warnings.join("\n")).toMatch(/Required header parameter "X-Trace-Id"/);
        // Optional ones stay quiet: they genuinely are expressible via options,
        // and warning on every header would bury the required case.
        expect(result.warnings.join("\n")).not.toContain("X-Optional");
    });

    it("warns for any tag that keeps no letters, not just two placeholder shapes", async () => {
        for (const tag of ["$", "1", "{}", "   "]) {
            const output = outputDirs.create("names-tagless-");
            const result = await generateFromConfig({
                input: writeSpec(output, {
                    openapi: "3.0.0",
                    info: { title: "t", version: "1.0.0" },
                    paths: {
                        "/x": { get: { tags: [tag], operationId: "x_get", responses: { "200": { description: "OK" } } } },
                    },
                }),
                output,
                options: { dateType: "string", enumStyle: "union", generateServices: true },
            });

            expect(result.warnings.join("\n"), tag).toMatch(/contains no characters usable in a name/);
            expect(readFileSync(join(output, "services", "index.ts"), "utf8"), tag).toContain("DefaultService");
        }
    });

    it("stays quiet when a tagged and an untagged operation share a controller", async () => {
        const output = outputDirs.create("names-partial-tag-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    // The common partially-tagged spec: path-derived "users" and
                    // the tag "Users" land in one controller by design, so
                    // warning here would fire on ordinary documents.
                    "/api/users": { get: { tags: ["Users"], operationId: "listUsers", responses: { "200": { description: "OK" } } } },
                    // Path-derived names come from the second segment, so this
                    // untagged operation resolves to "Users" as well.
                    "/api/users/{id}": {
                        get: {
                            operationId: "getUser",
                            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expect(result.warnings.filter((warning) => warning.includes("map to the controller"))).toEqual([]);
        expect(readFileSync(join(output, "services", "users.service.ts"), "utf8")).toContain("getUser(");
    });

    it("warns that a collision rename is part of the public signature", async () => {
        const output = outputDirs.create("names-renamewarn-");
        const result = await generateFromConfig({
            input: writeSpec(output, HOSTILE_OAS3_SPEC),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        // The suffix depends on which other parameters exist, so removing one
        // renumbers the survivor — a breaking change to call sites.
        expect(result.warnings.join("\n")).toMatch(/"filter\.name".*is exposed as "filterName2"/);
        expect(result.warnings.join("\n")).toMatch(/"options\[\]".*is exposed as "options2"/);
    });

    it("throws a typed error naming both operations when method names collide", async () => {
        const output = outputDirs.create("names-dupmethod-");
        const config = {
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/a": { get: { tags: ["Dup"], operationId: "list-things", responses: { "200": { description: "OK" } } } },
                    "/b": { get: { tags: ["Dup"], operationId: "list_things", responses: { "200": { description: "OK" } } } },
                },
            }),
            output,
            options: { dateType: "string" as const, enumStyle: "union" as const, generateServices: true },
        };

        // Captured once and asserted twice: generating a second time into the
        // same directory would couple this to whatever a failed run leaves
        // behind, which the sibling test above pins as "nothing".
        const error = await generateFromConfig(config).catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(DuplicateGeneratedNameError);
        // Names the operationIds, not just the class: the bare Error this
        // replaced left the user to work out which two collided.
        expect((error as Error).message).toMatch(/list-things .*and list_things /);
    });
});

describe("spec text reaching emitted literals", () => {
    it("escapes property names in generated models", async () => {
        const output = outputDirs.create("names-props-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                components: {
                    schemas: {
                        Thing: {
                            type: "object",
                            properties: {
                                // All legal property names in a spec. The
                                // unescaped `"NAME"` emission produced three
                                // syntax errors in this one file while
                                // generation reported success.
                                "say\"hi": { type: "string" },
                                "back\\slash": { type: "string" },
                                "has space": { type: "string" },
                                plain: { type: "string" },
                            },
                        },
                    },
                },
                paths: {
                    "/things": {
                        get: {
                            tags: ["Things"],
                            operationId: "listThings",
                            responses: {
                                "200": {
                                    description: "OK",
                                    content: {
                                        "application/json": {
                                            schema: { $ref: "#/components/schemas/Thing" },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expectGeneratedCodeCompiles(output);
    });

    it("cannot be escaped out of a JSDoc block by a description", async () => {
        const output = outputDirs.create("names-jsdoc-");
        // A description closing the comment lets everything after it be emitted
        // as code. At definition level the result is valid TypeScript, so it
        // compiles — a spec fetched by URL could write declarations into a
        // consumer's source tree with generation reporting success.
        const payload = "ends */ export const PWNED = 1; /*";
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                components: {
                    schemas: {
                        Doc: {
                            type: "object",
                            description: payload,
                            properties: { a: { type: "string", description: payload } },
                        },
                    },
                },
                paths: {
                    "/d": {
                        get: {
                            tags: ["D"],
                            operationId: "d",
                            description: payload,
                            responses: {
                                "200": {
                                    description: "OK",
                                    content: { "application/json": { schema: { $ref: "#/components/schemas/Doc" } } },
                                },
                            },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        for (const file of ["models/index.ts", "services/d.service.ts"]) {
            const emitted = readFileSync(join(output, file), "utf8");
            expect(emitted, file).not.toMatch(/^\s*export const PWNED/m);
        }
        expectGeneratedCodeCompiles(output);
    });

    it("escapes form-data and urlencoded field names", async () => {
        const output = outputDirs.create("names-formesc-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/upload": {
                        post: {
                            tags: ["Upload"],
                            operationId: "upload",
                            requestBody: {
                                content: {
                                    "multipart/form-data": {
                                        schema: {
                                            type: "object",
                                            properties: { "it's": { type: "string" }, "back\\slash": { type: "string" } },
                                        },
                                    },
                                },
                            },
                            responses: { "200": { description: "OK" } },
                        },
                    },
                    "/login": {
                        post: {
                            tags: ["Upload"],
                            operationId: "login",
                            requestBody: {
                                content: {
                                    "application/x-www-form-urlencoded": {
                                        schema: {
                                            type: "object",
                                            properties: { "it's": { type: "string" }, "back\\slash": { type: "string" } },
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

        const upload = readFileSync(join(output, "services", "upload.service.ts"), "utf8");
        // The wire name must survive intact inside the append call — the four
        // form-data sites were unguarded while the query-param site was not.
        expect(upload).toContain("formData.append('it\\'s'");
        expect(upload).toContain("formBody.append('it\\'s'");
        expectGeneratedCodeCompiles(output);
    });

    it("escapes array-typed form field names, not only scalar ones", async () => {
        const output = outputDirs.create("names-formarr-");
        const arrayField = { type: "array", items: { type: "string" } };
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/upload": {
                        post: {
                            tags: ["Arr"],
                            operationId: "upload",
                            requestBody: {
                                content: {
                                    "multipart/form-data": {
                                        schema: { type: "object", properties: { "it's": arrayField } },
                                    },
                                },
                            },
                            responses: { "200": { description: "OK" } },
                        },
                    },
                    "/login": {
                        post: {
                            tags: ["Arr"],
                            operationId: "login",
                            requestBody: {
                                content: {
                                    "application/x-www-form-urlencoded": {
                                        schema: { type: "object", properties: { "it's": arrayField } },
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

        // The array branches are separate call sites from the scalar ones; the
        // earlier test declared only string properties, so they never ran.
        const arr = readFileSync(join(output, "services", "arr.service.ts"), "utf8");
        expect(arr).toContain("formData.append('it\\'s'");
        expect(arr).toContain("formBody.append('it\\'s'");
        expectGeneratedCodeCompiles(output);
    });

    it("warns about a required cookie parameter, not only a header one", async () => {
        const output = outputDirs.create("names-cookie-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/c": {
                        get: {
                            tags: ["Cookie"],
                            operationId: "cookieOp",
                            parameters: [{ name: "session", in: "cookie", required: true, schema: { type: "string" } }],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expect(result.warnings.join("\n")).toMatch(/Required cookie parameter "session"/);
    });
});
