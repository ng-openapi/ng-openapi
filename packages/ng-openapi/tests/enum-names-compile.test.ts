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
//
// - edge-cases: named enums next to services and every other construct;
// - enum-names: one enum per naming case, including the sanitized names
//   (`__proto__`, `class`, `2nd place`) and an enum value with two names,
//   which only compiles when both names are used.
const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

const FIXTURES = [
    { fixture: "edge-cases", expected: ["Unknown", "JOB_IN_PROGRESS", "Archived"] },
    { fixture: "enum-names", expected: ["Below", "JOB_IN_PROGRESS", "FromVarnames", "Light", "Pale", "Colour"] },
] as const;

function readModels(output: string): string {
    const modelsDir = join(output, "models");
    return readdirSync(modelsDir)
        .map((file) => readFileSync(join(modelsDir, file), "utf8"))
        .join("\n");
}

describe("enum member names compile", () => {
    for (const { fixture, expected } of FIXTURES) {
        for (const enumStyle of ["enum", "union"] as const) {
            for (const modelFileStructure of ["single", "per-type"] as const) {
                it(`${fixture}: ${enumStyle} style, ${modelFileStructure} model files`, async () => {
                    const output = outputDirs.create(`enum-names-${fixture}-${enumStyle}-${modelFileStructure}-`);

                    await generateFromConfig({
                        input: fixturePath(fixture),
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
                    for (const name of expected) {
                        expect(models).toContain(name);
                    }
                    expectGeneratedCodeCompiles(output);
                }, 120_000);
            }
        }
    }
});

// The snapshots hold what was generated; this holds what was said about it.
// One warning per enum whose source was rejected or lost a name, and none for
// the enums whose description is simply not a list of names.
describe("enum member names warnings", () => {
    it("reports every rejected source of the enum-names fixture, and nothing else", async () => {
        const warnings: string[] = [];
        await generateFromConfig(
            {
                input: fixturePath("enum-names"),
                output: outputDirs.create("enum-names-warnings-"),
                options: {
                    dateType: "string",
                    enumStyle: "enum",
                    generateServices: false,
                    generateEnumBasedOnDescription: true,
                    enumNameExtensions: ["x-enum-varnames", "x-enumNames"],
                },
            },
            { onWarning: (message) => warnings.push(message) },
        );

        expect(warnings).toMatchInlineSnapshot(`
          [
            "Enum "ExtensionWrongLength": \`x-enumNames\` must be an array of 3 strings, one per enum value — ignoring it",
            "Enum "ExtensionNotStrings": \`x-enumNames\` must be an array of 2 strings, one per enum value — ignoring it",
            "Enum "ExtensionCollision": names from \`x-enum-varnames\` are not unique ("Same" occurs more than once) — ignoring it",
            "Enum "ExtensionBrokenThenDescription": \`x-enumNames\` must be an array of 2 strings, one per enum value — ignoring it",
            "Enum "DescribedDroppedAlias": the description names a value more often than the enum lists it — dropping "Color" (value 1)",
            "Enum "DescribedPartially": description looks like JSON (generateEnumBasedOnDescription) but could not be used: no Name for enum value 2 — falling back to raw enum values",
            "Enum "DescribedCollision": names from the description are not unique ("Same" occurs more than once) — falling back to raw enum values",
            "Enum "DescribedUnparseable": description looks like JSON (generateEnumBasedOnDescription) but could not be used: it does not parse — falling back to raw enum values",
            "Enum "DescribedWrongShape": description looks like JSON (generateEnumBasedOnDescription) but could not be used: expected an array of { "Name": string, "Value": string | number } objects — falling back to raw enum values",
          ]
        `);
    }, 120_000);
});
