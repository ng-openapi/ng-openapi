import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ModuleKind, Project, ScriptTarget } from "ts-morph";
import { afterAll, describe, expect, it } from "vitest";
import { generateFromConfig, InvalidIdentifierError } from "ng-openapi";

/**
 * Regression coverage for #125: `operationId`s and tags are free-form text in a
 * valid OpenAPI document, so anything the generator derives an identifier or a
 * file name from has to be sanitized. Before the fix these specs died inside
 * ts-morph ("A child syntax list was expected") after emitting a class named
 * `Groups(yes)Service` with a method named `groups{groupId}Delete`.
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

function outputDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpRoot, prefix));
    tempDirs.push(dir);
    return dir;
}

/** Fails with the formatted diagnostics when the generated output is not strict-clean. */
function expectCompiles(dir: string): void {
    const project = new Project({
        compilerOptions: {
            target: ScriptTarget.ES2022,
            module: ModuleKind.Preserve,
            strict: true,
            noImplicitAny: true,
            skipLibCheck: true,
            lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            noEmit: true,
        },
    });
    project.addSourceFilesAtPaths(`${dir.replace(/\\/g, "/")}/**/*.ts`);
    expect(project.getSourceFiles().length, "no generated files found").toBeGreaterThan(0);

    // The shipped header carries @ts-nocheck for consumers with exotic compiler
    // settings; strip it so this actually asserts the output is strict-clean.
    for (const sourceFile of project.getSourceFiles()) {
        const text = sourceFile.getFullText();
        if (text.includes("// @ts-nocheck")) {
            sourceFile.replaceWithText(text.replace("// @ts-nocheck\n", ""));
        }
    }

    const formatted = project.formatDiagnosticsWithColorAndContext(project.getPreEmitDiagnostics());
    expect(formatted, `Generated code failed to compile:\n${formatted}`).toBe("");
}

describe("specs whose names are illegal TypeScript identifiers (#125)", () => {
    it("generates compilable services and matching barrel exports", async () => {
        const output = outputDir("names-");
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

        expectCompiles(output);
    });

    it("generates compilable request-parameter interfaces from the same names", async () => {
        const output = outputDir("names-req-");
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

        expectCompiles(output);
    });

    it("sanitizes multipart field names, which never reach the params generator as identifiers", async () => {
        const output = outputDir("names-multipart-");
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

        expectCompiles(output);
    });

    it("keeps colliding query params distinct instead of losing one", async () => {
        const output = outputDir("names-collide-");
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

        expectCompiles(output);
    });

    it("warns when two distinct tags normalize onto one controller", async () => {
        const output = outputDir("names-tagmerge-");
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
        expect(result.warnings.join("\n")).toMatch(/"Groups \(yes\)" and "Groups-yes" both map to the controller "GroupsYes"/);
    });

    it("rejects `constructor`, which is a valid identifier but not a usable method name", async () => {
        const output = outputDir("names-ctor-");

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
        const output = outputDir("names-hook-");

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
        const output = outputDir("names-hook-ok-");
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
        expectCompiles(output);
    });
});
