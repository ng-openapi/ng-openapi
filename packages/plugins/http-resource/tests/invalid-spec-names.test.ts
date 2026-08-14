import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { afterAll, expect, it } from "vitest";
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
