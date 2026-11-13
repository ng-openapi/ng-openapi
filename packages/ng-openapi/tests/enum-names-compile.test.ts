import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";

// Author-supplied enum member names (#31) reach the output as identifiers:
// ts-morph members in enum style, and keys spliced into a raw object-literal
// string in union style. The golden snapshots only compare bytes, and the
// URL-driven compile-check suite runs against specs that carry no naming
// source, so this is the one place the named output is actually type-checked.
// The edge-cases fixture has an extension-named integer enum, a string enum
// naming two extensions, a malformed extension and a JSON description.
const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

function readModels(output: string): string {
    const modelsDir = join(output, "models");
    return readdirSync(modelsDir)
        .map((file) => readFileSync(join(modelsDir, file), "utf8"))
        .join("\n");
}

describe("enum member names compile", () => {
    for (const enumStyle of ["enum", "union"] as const) {
        for (const modelFileStructure of ["single", "per-type"] as const) {
            it(`${enumStyle} style, ${modelFileStructure} model files`, async () => {
                const output = outputDirs.create(`enum-names-${enumStyle}-${modelFileStructure}-`);

                await generateFromConfig({
                    input: fixturePath("edge-cases"),
                    output,
                    options: {
                        dateType: "string",
                        enumStyle,
                        modelFileStructure,
                        generateServices: true,
                        generateEnumBasedOnDescription: true,
                        enumNameExtensions: ["x-enum-varnames", "x-enumNames"],
                    },
                });

                // Guards the check itself: compiling value-named fallbacks
                // would prove nothing about the names
                const models = readModels(output);
                for (const name of ["Unknown", "JOB_IN_PROGRESS", "Archived"]) {
                    expect(models).toContain(name);
                }
                expectGeneratedCodeCompiles(output);
            }, 120_000);
        }

        // .NET aliases (`Light = 1, Pale = 1`) reach the spec as a repeated
        // enum value. Named after their values the two members would share a
        // key, which does not compile; the description has to name both.
        it(`${enumStyle} style, an enum value with two names`, async () => {
            const output = outputDirs.create(`enum-names-${enumStyle}-aliases-`);
            const input = join(outputDirs.create("enum-names-aliases-spec-"), "spec.json");
            writeFileSync(
                input,
                JSON.stringify({
                    openapi: "3.0.3",
                    info: { title: "Aliases", version: "1.0.0" },
                    paths: {},
                    components: {
                        schemas: {
                            Shade: {
                                type: "integer",
                                enum: [1, 1, 2],
                                description: JSON.stringify([
                                    { Name: "Light", Value: 1 },
                                    { Name: "Pale", Value: 1 },
                                    { Name: "Dark", Value: 2 },
                                ]),
                            },
                        },
                    },
                }),
            );

            await generateFromConfig({
                input,
                output,
                options: {
                    dateType: "string",
                    enumStyle,
                    generateServices: false,
                    generateEnumBasedOnDescription: true,
                },
            });

            const models = readModels(output);
            for (const name of ["Light", "Pale", "Dark"]) {
                expect(models).toContain(name);
            }
            expectGeneratedCodeCompiles(output);
        }, 120_000);
    }
});
