import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { expectGeneratedCodeCompiles } from "@ng-openapi/testing";
import { DuplicateGeneratedNameError, generateFromConfig } from "ng-openapi";
import { ZodPlugin } from "../src";

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

it("fails on two operationIds that normalize onto one validator name", async () => {
    const output = mkdtempSync(join(tmpRoot, "zod-dup-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    // Both give "groupsGroupIdDelete" once illegal characters are separators,
    // which used to emit two `export const groupsGroupIdDeleteQueryParams`
    // into one file. The service generator throws on the equivalent method
    // collision; zod had no such guard and wrote uncompilable output.
    const operationIds = ["groups_{group_id}_delete", "groups.group.id-delete"];
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            paths: Object.fromEntries(
                operationIds.map((operationId, index) => [
                    `/p${index}`,
                    {
                        get: {
                            tags: ["Groups"],
                            operationId,
                            parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                            responses: { "200": { description: "OK" } },
                        },
                    },
                ]),
            ),
        }),
    );

    await expect(
        generateFromConfig({
            input,
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: false },
            plugins: [ZodPlugin],
        }),
    ).rejects.toBeInstanceOf(DuplicateGeneratedNameError);
});

it("names the colliding operations, not the generated consts", async () => {
    const output = mkdtempSync(join(tmpRoot, "zod-dup-msg-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    // Different tags, so the collision spans two files: the validators barrel
    // re-exports both with `export *`, silently dropping one symbol.
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            paths: {
                "/a": {
                    get: {
                        tags: ["Alpha"],
                        operationId: "list-things",
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: { "200": { description: "OK" } },
                    },
                },
                "/b": {
                    get: {
                        tags: ["Beta"],
                        operationId: "list_things",
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        }),
    );

    await expect(
        generateFromConfig({
            input,
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: false },
            plugins: [ZodPlugin],
        }),
    ).rejects.toThrow(/list-things .*and list_things /);
});

it("keeps a __proto__ parameter in the emitted schema", async () => {
    const output = mkdtempSync(join(tmpRoot, "zod-proto-"));
    tempDirs.push(output);

    const input = join(output, "spec.json");
    writeFileSync(
        input,
        JSON.stringify({
            openapi: "3.0.0",
            info: { title: "t", version: "1.0.0" },
            paths: {
                "/probe": {
                    get: {
                        tags: ["Probe"],
                        operationId: "probe",
                        parameters: [
                            // Assigning this key on an object literal hits the
                            // prototype setter and creates no own property, so
                            // the parameter vanished from the schema entirely.
                            { name: "__proto__", in: "query", required: true, schema: { type: "string" } },
                            { name: "constructor", in: "query", required: true, schema: { type: "string" } },
                            { name: "normal", in: "query", required: true, schema: { type: "string" } },
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
        options: { dateType: "string", enumStyle: "union", generateServices: false },
        plugins: [ZodPlugin],
    });

    const validator = readFileSync(join(output, "validators", "probe.validator.ts"), "utf8");
    for (const wireName of ["__proto__", "constructor", "normal"]) {
        expect(validator, `${wireName} missing from the schema`).toContain(`"${wireName}":`);
    }

    expectGeneratedCodeCompiles(output, "zod output");
});
