import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, expectNoDeclaration } from "@ng-openapi/testing";
import type { GeneratorConfig } from "ng-openapi";
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
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/a": {
                        get: {
                            tags: ["Groups (yes)"],
                            operationId: "a_get",
                            responses: { "200": { description: "OK" } },
                        },
                    },
                    "/b": {
                        get: {
                            tags: ["Groups-yes"],
                            operationId: "b_get",
                            responses: { "200": { description: "OK" } },
                        },
                    },
                },
            }),
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
                        "/x": {
                            get: { tags: [tag], operationId: "x_get", responses: { "200": { description: "OK" } } },
                        },
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
                    "/api/users": {
                        get: { tags: ["Users"], operationId: "listUsers", responses: { "200": { description: "OK" } } },
                    },
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
                    "/a": {
                        get: { tags: ["Dup"], operationId: "list-things", responses: { "200": { description: "OK" } } },
                    },
                    "/b": {
                        get: { tags: ["Dup"], operationId: "list_things", responses: { "200": { description: "OK" } } },
                    },
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
                                'say"hi': { type: "string" },
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
        // A description closing the comment lets everything after it be emitted
        // as code. At definition level the result is valid TypeScript, so it
        // compiles — a spec fetched by URL could write declarations into a
        // consumer's source tree with generation reporting success.
        // Every declaration form, not just a const: the assertion helper covers
        // seven kinds, and a single `const` payload left the other six
        // unwatched — the widening could be reverted with the suite green.
        const injections = [
            "export const PWNED = 1;",
            "export function PWNED2() {}",
            "export class PWNED3 {}",
            "export interface PWNED4 { a: string }",
            "export enum PWNED5 { A }",
            "export type PWNED6 = string;",
            "export namespace PWNED7 { export const x = 1; }",
        ];
        const injectedNames = ["PWNED", "PWNED2", "PWNED3", "PWNED4", "PWNED5", "PWNED6", "PWNED7"];
        const payloadFor = (index: number): string => `ends */ ${injections[index % injections.length]} /*`;
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            components: {
                schemas: {
                    // Object definition + property (interface-builder).
                    Doc: {
                        type: "object",
                        description: payloadFor(0),
                        properties: { a: { type: "string", description: payloadFor(2) } },
                    },
                    // Enum definition, both enumStyles (enum-builder).
                    Status: { type: "string", enum: ["a", "b"], description: payloadFor(3) },
                    // Type-alias branches (type.generator).
                    Alias: { type: "string", description: payloadFor(4) },
                    ArrayAlias: { type: "array", items: { type: "string" }, description: payloadFor(5) },
                    AllOfAlias: { allOf: [{ $ref: "#/components/schemas/Doc" }], description: payloadFor(6) },
                },
            },
            paths: {
                "/d": {
                    get: {
                        tags: ["D"],
                        operationId: "d",
                        description: payloadFor(1),
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: {
                            "200": {
                                description: "OK",
                                content: { "application/json": { schema: { $ref: "#/components/schemas/Doc" } } },
                            },
                        },
                    },
                },
            },
        };

        // Every variant that routes descriptions differently: both enum styles,
        // the request-parameter interfaces, and the plugin's resource methods.
        const variants: { label: string; extra: Omit<GeneratorConfig["options"], "dateType"> }[] = [
            { label: "union", extra: { enumStyle: "union" } },
            { label: "enum", extra: { enumStyle: "enum" } },
            { label: "request-param", extra: { enumStyle: "union", useSingleRequestParameter: true } },
        ];
        for (const { label, extra } of variants) {
            const output = outputDirs.create(`names-jsdoc-${label}-`);
            await generateFromConfig({
                input: writeSpec(output, spec),
                output,
                options: { dateType: "string", generateServices: true, ...extra },
                plugins: [HttpResourcePlugin],
            });

            // Parsed, not pattern-matched: ts-morph emits the JSDoc inline, so
            // the injected code never starts a line, and it compiles, so the
            // compile assertion cannot see it either.
            for (const injected of injectedNames.slice(0, 7)) {
                expectNoDeclaration(output, injected);
            }
            expectGeneratedCodeCompiles(output, `${label} output`);
        }
    });

    it("escapes the Accept value, which is spec text too", async () => {
        const output = outputDirs.create("names-accept-");
        // The response content type reaches a single-quoted literal. Unescaped
        // it closed the literal and the rest became a statement — which
        // compiles, and which expectNoDeclaration cannot see because an
        // assignment is not a declaration.
        const contentType = "application/json'); (globalThis as Record<string, unknown>)['pwned'] = 1; //";
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/a": {
                        get: {
                            tags: ["A"],
                            operationId: "a",
                            responses: {
                                "200": {
                                    description: "OK",
                                    content: { [contentType]: { schema: { type: "string" } } },
                                },
                            },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const service = readFileSync(join(output, "services", "a.service.ts"), "utf8");
        expect(service).not.toContain("['pwned'] = 1");
        expectGeneratedCodeCompiles(output);
    });

    it("reports an unquoted YAML version rather than throwing a raw TypeError", async () => {
        const output = outputDirs.create("names-yamlver-");
        const input = join(output, "spec.yaml");
        // `swagger: 2.0` unquoted parses as a number — how most YAML specs are
        // written. .startsWith threw before the SpecParseError could report it.
        writeFileSync(input, "swagger: 2.0\ninfo:\n  title: t\n  version: 1.0.0\npaths: {}\n");

        // Either it is accepted as 2.x or it is rejected with the typed error;
        // what it must not do is throw an untyped TypeError from inside a guard.
        const result = await generateFromConfig({
            input,
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        }).catch((reason: unknown) => reason);

        expect(result).not.toBeInstanceOf(TypeError);
    });

    it("escapes a regex pattern and ignores non-numeric constraints", async () => {
        const output = outputDirs.create("names-pattern-");
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                components: {
                    schemas: {
                        Doc: {
                            type: "object",
                            properties: {
                                // A quote in the pattern closed the RegExp
                                // literal; the numeric constraints are untrusted
                                // JSON and landed in expression position.
                                a: { type: "string", pattern: "^it's$", minLength: "3); evil(" },
                                b: { type: "number", minimum: "1); evil(" },
                            },
                        },
                    },
                },
                paths: {
                    "/d": {
                        get: {
                            tags: ["D"],
                            operationId: "d",
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
            options: { dateType: "string", enumStyle: "union", generateServices: false },
            plugins: [ZodPlugin],
        });

        const validator = readFileSync(join(output, "validators", "d.validator.ts"), "utf8");
        expect(validator).not.toContain("evil(");
        expectGeneratedCodeCompiles(output, "zod output");
    });

    it("tolerates a description that is not a string", async () => {
        const output = outputDirs.create("names-jsdoc-nonstring-");
        // Untrusted JSON: nothing schema-validates a description, and this used
        // to be emitted harmlessly rather than aborting the run.
        await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                components: {
                    schemas: { Doc: { type: "object", description: 42, properties: { a: { type: "string" } } } },
                },
                paths: {
                    "/d": {
                        get: {
                            tags: ["D"],
                            operationId: "d",
                            description: 42,
                            parameters: [{ name: "q", in: "query", description: 42, schema: { type: "string" } }],
                            // Content, so the zod plugin actually builds a
                            // schema from Doc — without it the plugin never
                            // reaches the description at all and the fixture
                            // proves nothing about it.
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
            // Both plugins: zod builds its own .describe() literal rather than
            // going through emitDocs, and was still throwing a raw TypeError.
            plugins: [HttpResourcePlugin, ZodPlugin],
        });

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
                                            properties: {
                                                "it's": { type: "string" },
                                                "back\\slash": { type: "string" },
                                            },
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
                                            properties: {
                                                "it's": { type: "string" },
                                                "back\\slash": { type: "string" },
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

describe("names the round-9 review found unguarded", () => {
    const oas3 = (paths: unknown, components?: unknown) => ({
        openapi: "3.0.0",
        info: { title: "t", version: "1.0.0" },
        ...(components ? { components } : {}),
        paths,
    });
    const ok = { "200": { description: "OK" } };

    it("drops a parameter with no usable name, out loud, instead of emitting an empty identifier", async () => {
        const output = outputDirs.create("names-nameless-param-");
        // "" and an object are not names. 42 is: a YAML `name: 42` plainly means
        // a name. The old boundary coerced all three to "" and the signature
        // got an empty identifier — TS1003 four times over, reported as success.
        const result = await generateFromConfig({
            input: writeSpec(
                output,
                oas3({
                    "/p": {
                        get: {
                            tags: ["P"],
                            operationId: "p",
                            parameters: [
                                { name: "", in: "query", schema: { type: "string" } },
                                { name: { x: 1 }, in: "query", schema: { type: "string" } },
                                { name: 42, in: "query", schema: { type: "string" } },
                                { name: "kept", in: "query", schema: { type: "string" } },
                            ],
                            responses: ok,
                        },
                    },
                }),
            ),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        const nameless = result.warnings.filter((warning) => warning.includes("and was skipped. Give it a name"));
        expect(nameless).toHaveLength(2);
        // Names the location the spec gave, and shows the offending value —
        // never a fabricated \"query\" nor a JSON.stringify(undefined) hole.
        expect(nameless[0]).toContain('A query parameter of (GET) /p has name "" and was skipped');
        expect(nameless[1]).toContain('A query parameter of (GET) /p has name {"x":1} and was skipped');
        const service = readFileSync(join(output, "services", "p.service.ts"), "utf8");
        expect(service).toContain("params, kept, 'kept'");
        expect(service).toContain("'42'");
        expectGeneratedCodeCompiles(output);
    });

    it("ignores a tags entry that is not a string", async () => {
        const output = outputDirs.create("names-objtag-");
        await generateFromConfig({
            input: writeSpec(
                output,
                oas3({ "/t": { get: { tags: [{ x: 1 }, "Real"], operationId: "t", responses: ok } } }),
            ),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        expect(readFileSync(join(output, "services", "index.ts"), "utf8")).toContain("RealService");
        expectGeneratedCodeCompiles(output);
    });

    it("emits zod default values as literals, recursively", async () => {
        const output = outputDirs.create("names-zoddefault-");
        await generateFromConfig({
            input: writeSpec(
                output,
                oas3(
                    {
                        "/d": {
                            get: {
                                tags: ["D"],
                                operationId: "d",
                                responses: {
                                    "200": {
                                        description: "OK",
                                        content: {
                                            "application/json": { schema: { $ref: "#/components/schemas/Doc" } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    {
                        schemas: {
                            Doc: {
                                type: "object",
                                properties: {
                                    // Object keys are spec text: `{ my-key: 1 }` is a
                                    // syntax error and a __proto__ key is the setter.
                                    // Both halves via JSON.parse: a __proto__ key written in
                                    // JS source is the prototype setter, never a property —
                                    // the same trap the fix closes, one level up in the test.
                                    obj: JSON.parse(
                                        '{"type":"object","properties":{"my-key":{"type":"number"},"__proto__":{"type":"number"},' +
                                            '"nested":{"type":"object","properties":{"a":{"type":"array","items":{"type":"number","nullable":true}}}}},' +
                                            '"default":{"my-key":1,"__proto__":2,"nested":{"a":[1,null]}}}',
                                    ),
                                    // Not emitEnumMember: that turns null into the
                                    // *string* 'null', which is right for a z.enum
                                    // member and wrong for a default.
                                    arr: {
                                        type: "array",
                                        items: { type: "string", nullable: true },
                                        default: ["x", null],
                                    },
                                },
                            },
                        },
                    },
                ),
            ),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: false },
            plugins: [ZodPlugin],
        });

        const validator = readFileSync(join(output, "validators", "d.validator.ts"), "utf8");
        expect(validator).toContain(".default(['x', null])");
        expect(validator).toContain('"my-key": 1');
        expect(validator).toContain('["__proto__"]: 2');
        expect(validator).not.toContain("[object Object]");
        expectGeneratedCodeCompiles(output, "zod output");
    });

    it("renames an operation whose name is a member the class binds, and says so", async () => {
        const output = outputDirs.create("names-basepath-");
        const result = await generateFromConfig({
            input: writeSpec(output, oas3({ "/b": { get: { tags: ["B"], operationId: "basePath", responses: ok } } })),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        // `basePath` is a property of the generated class; a method of the same
        // name was TS2300 ten times over, reported as success.
        expect(result.warnings.join("\n")).toMatch(/would be named "basePath".*emitted as "_basePath"/);
        expect(readFileSync(join(output, "services", "b.service.ts"), "utf8")).toContain("_basePath(");
        expectGeneratedCodeCompiles(output);
    });

    it("rejects a customizeMethodName result that lands on a class member", async () => {
        const output = outputDirs.create("names-hook-member-");
        await expect(
            generateFromConfig({
                input: writeSpec(output, oas3({ "/b": { get: { tags: ["B"], operationId: "x", responses: ok } } })),
                output,
                options: {
                    dateType: "string",
                    enumStyle: "union",
                    generateServices: true,
                    customizeMethodName: () => "httpClient",
                },
            }),
        ).rejects.toBeInstanceOf(InvalidIdentifierError);
    });

    it("merges controllers that differ only by case into one file", async () => {
        const output = outputDirs.create("names-casefold-");
        // USER and User are one file on Windows and default macOS; kept apart,
        // one service was silently lost and the barrel exported a class that
        // was not on disk.
        const result = await generateFromConfig({
            input: writeSpec(
                output,
                oas3({
                    "/a": { get: { tags: ["USER"], operationId: "a", responses: ok } },
                    "/b": { get: { tags: ["User"], operationId: "b", responses: ok } },
                }),
            ),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        const services = readdirSync(join(output, "services")).filter((name) => name.endsWith(".service.ts"));
        expect(services).toHaveLength(1);
        const merged = readFileSync(join(output, "services", services[0]), "utf8");
        expect(merged).toContain("a(");
        expect(merged).toContain("b(");
        expect(result.warnings.join("\n")).toMatch(/"USER" and "User" all map to the controller/);
        expectGeneratedCodeCompiles(output);
    });

    it("rejects two schemas whose names sanitize onto one type", async () => {
        const output = outputDirs.create("names-typecollide-");
        // TypeScript declaration-merges two interfaces of one name, so the
        // compile check is blind to it and one model silently acquires the
        // other's properties.
        const error = await generateFromConfig({
            input: writeSpec(
                output,
                oas3(
                    { "/d": { get: { tags: ["D"], operationId: "d", responses: ok } } },
                    {
                        schemas: {
                            "Pet-Store": { type: "object", properties: { a: { type: "string" } } },
                            "Pet.Store": { type: "object", properties: { b: { type: "string" } } },
                        },
                    },
                ),
            ),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        }).catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(DuplicateGeneratedNameError);
        expect((error as Error).message).toMatch(/"Pet_Store" from schemas "Pet-Store" and "Pet.Store"/);
    });

    it("keeps generating for a clientName that is not an identifier", async () => {
        for (const clientName of ["my-client", "my.client", "My (Api)"]) {
            const output = outputDirs.create("names-clientname-");
            await generateFromConfig({
                input: writeSpec(output, oas3({ "/c": { get: { tags: ["C"], operationId: "c", responses: ok } } })),
                output,
                clientName,
                options: { dateType: "string", enumStyle: "union", generateServices: true },
            });
            expectGeneratedCodeCompiles(output, clientName);
        }
        const output = outputDirs.create("names-clientname-final-");
        await generateFromConfig({
            input: writeSpec(output, oas3({ "/c": { get: { tags: ["C"], operationId: "c", responses: ok } } })),
            output,
            clientName: "my-client",
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        // The identifiers are sanitized; the string positions keep the raw value.
        expect(readFileSync(join(output, "providers.ts"), "utf8")).toContain("provideMyClientClient");
        expect(readFileSync(join(output, "tokens", "index.ts"), "utf8")).toContain("BASE_PATH_MY_CLIENT");
    });

    it("warns when a request-parameter interface takes the controller-prefixed name", async () => {
        // Exactly one collision: B's getItem finds GetItemParams taken and
        // becomes BGetItemParams. That branch renamed an exported type silently
        // while only the renumbered branch below warned.
        const output = outputDirs.create("names-paramsiface-prefix-");
        const result = await generateFromConfig({
            input: writeSpec(
                output,
                oas3({
                    "/a": {
                        get: {
                            tags: ["A"],
                            operationId: "getItem",
                            parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                            responses: ok,
                        },
                    },
                    "/b": {
                        get: {
                            tags: ["B"],
                            operationId: "getItem",
                            parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                            responses: ok,
                        },
                    },
                }),
            ),
            output,
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                useSingleRequestParameter: true,
            },
        });
        expect(result.warnings.join("\n")).toMatch(
            /interface "GetItemParams" is already taken.*exposed as "BGetItemParams"/,
        );
        expectGeneratedCodeCompiles(output);
    });

    it("warns when a request-parameter interface has to be renumbered", async () => {
        const output = outputDirs.create("names-paramsiface-");
        // A: getItem claims GetItemParams. B: bGetItem claims BGetItemParams as
        // its base; then B: getItem finds both its candidates taken. The result
        // is an exported type renumbered by what else the spec declares.
        const result = await generateFromConfig({
            input: writeSpec(
                output,
                oas3({
                    "/a": {
                        get: {
                            tags: ["A"],
                            operationId: "getItem",
                            parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                            responses: ok,
                        },
                    },
                    "/b1": {
                        get: {
                            tags: ["B"],
                            operationId: "bGetItem",
                            parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                            responses: ok,
                        },
                    },
                    "/b2": {
                        get: {
                            tags: ["B"],
                            operationId: "getItem",
                            parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                            responses: ok,
                        },
                    },
                }),
            ),
            output,
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                useSingleRequestParameter: true,
            },
        });
        expect(result.warnings.join("\n")).toMatch(
            /interface "GetItemParams" is already taken.*exposed as "BGetItemParams2"/,
        );
        expectGeneratedCodeCompiles(output);
    });
});

describe("clientName reaches text, identifiers and a token value", () => {
    const ok = { "200": { description: "OK" } };
    const spec = {
        openapi: "3.0.0",
        info: { title: "t", version: "1.0.0" },
        paths: { "/c": { get: { tags: ["C"], operationId: "c", responses: ok } } },
    };
    const literalOf = (source: string, marker: string): unknown => {
        const at = source.indexOf(marker);
        expect(at, marker).toBeGreaterThan(-1);
        const rest = source.slice(at + marker.length);
        const quote = rest[0];
        let i = 1;
        while (i < rest.length && !(rest[i] === quote && rest[i - 1] !== "\\")) i++;
        return new Function(`return ${rest.slice(0, i + 1)};`)();
    };

    it("escapes every comment and literal it reaches, and the token agrees with its setters", async () => {
        // A comment terminator, a quote and a backslash: one value that hits
        // the five raw comment sites, the token default and both setters.
        const clientName = "x*/ export const PWNED = 1; /* it" + "'" + "s a" + "\\" + "b";
        const output = outputDirs.create("names-clientname-esc-");
        await generateFromConfig({
            input: writeSpec(output, spec),
            output,
            clientName,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
            plugins: [HttpResourcePlugin],
        });

        expectNoDeclaration(output, "PWNED");
        // The value the token defaults to and the value the setters write must
        // be the same string, or a clientName-scoped interceptor stops
        // recognizing its own requests. Before, for a backslash, they differed
        // silently — both compiled.
        const tokenDefault = literalOf(
            readFileSync(join(output, "tokens", "index.ts"), "utf8"),
            "new HttpContextToken<string>(() => ",
        );
        const serviceSet = literalOf(
            readFileSync(join(output, "services", "c.service.ts"), "utf8"),
            "context.set(this.clientContextToken, ",
        );
        const resourceSet = literalOf(
            readFileSync(join(output, "resources", "c.resource.ts"), "utf8"),
            "context.set(this.clientContextToken, ",
        );
        expect(tokenDefault).toBe(clientName);
        expect(serviceSet).toBe(clientName);
        expect(resourceSet).toBe(clientName);
        expectGeneratedCodeCompiles(output);
    });

    it("keeps an identifier-shaped clientName verbatim in generated identifiers", async () => {
        // These compiled before; sending them through pascalCase renamed the
        // function every consumer imports. Only names that could not have
        // compiled are sanitized.
        const cases: [string, string][] = [
            ["my_client", "provideMy_clientClient"],
            ["_internal", "provide_internalClient"],
            ["A1_b", "provideA1_bClient"],
            ["my-client", "provideMyClientClient"],
            ["my client", "provideMyClientClient"],
        ];
        for (const [clientName, provider] of cases) {
            const output = outputDirs.create("names-clientname-id-");
            await generateFromConfig({
                input: writeSpec(output, spec),
                output,
                clientName,
                options: { dateType: "string", enumStyle: "union", generateServices: true },
            });
            expect(readFileSync(join(output, "providers.ts"), "utf8"), clientName).toContain(provider);
            expectGeneratedCodeCompiles(output, clientName);
        }
    });

    it("treats an empty clientName as the default client", async () => {
        // One site used `|| "default"` and two used default parameters, which
        // fire only on undefined — so "" emitted BASE_PATH_ in the tokens and
        // imported BASE_PATH_DEFAULT in the providers.
        const output = outputDirs.create("names-clientname-empty-");
        await generateFromConfig({
            input: writeSpec(output, spec),
            output,
            clientName: "",
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        expect(readFileSync(join(output, "tokens", "index.ts"), "utf8")).toContain("BASE_PATH_DEFAULT");
        expectGeneratedCodeCompiles(output);
    });
});

describe("parameters the generators used to lose", () => {
    const ok = { "200": { description: "OK" } };

    it("resolves a $ref parameter instead of reporting it nameless", async () => {
        const output = outputDirs.create("names-paramref-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                components: { parameters: { Q: { name: "q", in: "query", schema: { type: "string" } } } },
                paths: {
                    "/r": {
                        get: {
                            tags: ["R"],
                            operationId: "r",
                            parameters: [
                                { $ref: "#/components/parameters/Q" },
                                { $ref: "#/components/parameters/Missing" },
                            ],
                            responses: ok,
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        expect(readFileSync(join(output, "services", "r.service.ts"), "utf8")).toContain("params, q, " + "'q'");
        expect(result.warnings.join("\n")).toMatch(/"#\/components\/parameters\/Missing", which does not resolve/);
        expect(result.warnings.join("\n")).not.toContain("no usable name");
        expectGeneratedCodeCompiles(output);
    });

    it("does not bind a local parameter for a ref that points elsewhere", async () => {
        // A resolver that matched only the last pointer segment bound the
        // local `Foo` parameter for both of these — a different parameter sent
        // on the wire, silently. Both must be skipped, each with its own cause.
        const output = outputDirs.create("names-paramref-elsewhere-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                components: {
                    parameters: { Foo: { name: "foo", in: "query", schema: { type: "string" } } },
                    schemas: { Foo: { type: "object" } },
                },
                paths: {
                    "/r": {
                        get: {
                            tags: ["R"],
                            operationId: "r",
                            parameters: [
                                { $ref: "common.yaml#/components/parameters/Foo" },
                                { $ref: "#/components/schemas/Foo" },
                            ],
                            responses: ok,
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        const service = readFileSync(join(output, "services", "r.service.ts"), "utf8");
        expect(service).not.toContain("foo");
        const warnings = result.warnings.join("\n");
        expect(warnings).toMatch(
            /references "common\.yaml#\/components\/parameters\/Foo", which points into another document \("common\.yaml"\)/,
        );
        expect(warnings).toMatch(
            /references "#\/components\/schemas\/Foo", which is not a parameter component pointer/,
        );
        expectGeneratedCodeCompiles(output);
    });

    it("follows a chain of parameter references and reports a cycle", async () => {
        // components.parameters entries may themselves be Reference Objects.
        // Single-level resolution dropped A → B and said the parameter had no
        // name — re-creating the misdiagnosis the resolver was added to remove.
        const output = outputDirs.create("names-paramref-chain-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                openapi: "3.0.0",
                info: { title: "t", version: "1.0.0" },
                components: {
                    parameters: {
                        A: { $ref: "#/components/parameters/B" },
                        B: { name: "b", in: "query", schema: { type: "string" } },
                        X: { $ref: "#/components/parameters/Y" },
                        Y: { $ref: "#/components/parameters/X" },
                    },
                },
                paths: {
                    "/r": {
                        get: {
                            tags: ["R"],
                            operationId: "r",
                            parameters: [{ $ref: "#/components/parameters/A" }, { $ref: "#/components/parameters/X" }],
                            responses: ok,
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        expect(readFileSync(join(output, "services", "r.service.ts"), "utf8")).toContain("params, b, " + "'b'");
        const warnings = result.warnings.join("\n");
        expect(warnings).not.toContain("Give it a name");
        expect(warnings).toMatch(
            /references "#\/components\/parameters\/X", which is part of a reference cycle \("#\/components\/parameters\/X" -> "#\/components\/parameters\/Y" -> "#\/components\/parameters\/X"\)/,
        );
        expectGeneratedCodeCompiles(output);
    });

    it("resolves Swagger 2.0 top-level parameters", async () => {
        const output = outputDirs.create("names-paramref-v2-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                swagger: "2.0",
                info: { title: "t", version: "1.0.0" },
                parameters: { Q: { name: "q", in: "query", type: "string" } },
                paths: {
                    "/r": {
                        get: {
                            tags: ["R"],
                            operationId: "r",
                            parameters: [{ $ref: "#/parameters/Q" }],
                            responses: ok,
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        expect(readFileSync(join(output, "services", "r.service.ts"), "utf8")).toContain("params, q, " + "'q'");
        expect(result.warnings.join("\n")).not.toContain("#/parameters/Q");
        expectGeneratedCodeCompiles(output);
    });

    it("warns when a parameter is dropped because its location is not supported", async () => {
        const output = outputDirs.create("names-droppedin-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                swagger: "2.0",
                info: { title: "t", version: "1.0.0" },
                paths: {
                    "/upload": {
                        post: {
                            tags: ["U"],
                            operationId: "upload",
                            parameters: [
                                { name: "file", in: "formData", required: true, type: "file" },
                                { name: "note", in: "formData", type: "string" },
                                { name: "X-Optional", in: "header", type: "string" },
                            ],
                            responses: ok,
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });
        const warnings = result.warnings.join("\n");
        // Swagger 2.0's form upload — required — used to vanish and report success.
        expect(warnings).toMatch(/in: formData` parameter "file".*dropped \(it is marked required\)/);
        expect(warnings).toMatch(/in: formData` parameter "note".*dropped\./);
        // An optional header is expressible via options; it stays quiet.
        expect(warnings).not.toContain("X-Optional");
    });
});
