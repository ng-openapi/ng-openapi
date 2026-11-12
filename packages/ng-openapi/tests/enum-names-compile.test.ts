import { readdirSync, readFileSync } from "node:fs";
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
    }
});
