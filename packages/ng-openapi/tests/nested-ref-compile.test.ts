import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ModuleKind, Project, ScriptTarget } from "ts-morph";
import { afterAll, describe, expect, it } from "vitest";
import { generateFromConfig } from "ng-openapi";

// Regression for the deep-pointer $ref bug: an operation schema that is a
// `$ref` to a *nested property* of another schema
// (`#/components/schemas/PolicyEntry/properties/namespaces`) used to emit an
// undefined, unimported type `Namespaces` → `error TS2304: Cannot find name
// 'Namespaces'`. The reference is now inlined at parse time (string[]), so the
// generated service must compile clean.
const REPRO_SPEC = {
    openapi: "3.0.0",
    info: { title: "nested-ref repro", version: "1" },
    paths: {
        "/api/2/policies/{policyId}/entries/{label}/namespaces": {
            get: {
                tags: ["Policies"],
                operationId: "getNamespaces",
                parameters: [
                    { name: "policyId", in: "path", required: true, schema: { type: "string" } },
                    { name: "label", in: "path", required: true, schema: { type: "string" } },
                ],
                responses: {
                    "200": {
                        description: "ok",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/PolicyEntry/properties/namespaces" },
                            },
                        },
                    },
                },
            },
            put: {
                tags: ["Policies"],
                operationId: "putNamespaces",
                parameters: [
                    { name: "policyId", in: "path", required: true, schema: { type: "string" } },
                    { name: "label", in: "path", required: true, schema: { type: "string" } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/PolicyEntry/properties/namespaces" },
                        },
                    },
                },
                responses: { "204": { description: "updated" } },
            },
        },
    },
    components: {
        schemas: {
            PolicyEntry: {
                type: "object",
                properties: {
                    namespaces: {
                        type: "array",
                        description: "Namespace patterns this policy entry applies to.",
                        items: { type: "string" },
                    },
                },
            },
        },
    },
};

describe("nested-property $ref", () => {
    const tempDirs: string[] = [];
    const tmpRoot = join(process.cwd(), "tmp", "ng-openapi-tests");
    mkdirSync(tmpRoot, { recursive: true });

    afterAll(() => {
        for (const dir of tempDirs) {
            try {
                rmSync(dir, { recursive: true, force: true });
            } catch {
                // best-effort cleanup
            }
        }
    });

    it("inlines the nested schema so the generated service compiles", async () => {
        const workDir = mkdtempSync(join(tmpRoot, "nested-ref-"));
        tempDirs.push(workDir);
        const specPath = join(workDir, "spec.json");
        const outputDir = join(workDir, "out");
        writeFileSync(specPath, JSON.stringify(REPRO_SPEC), "utf8");

        await generateFromConfig({
            input: specPath,
            output: outputDir,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

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

        const globPath = `${outputDir.replace(/\\/g, "/")}/**/*.ts`;
        project.addSourceFilesAtPaths(globPath);

        const serviceFile = project
            .getSourceFiles()
            .find((file) => file.getFilePath().includes("policies.service"));
        if (!serviceFile) {
            throw new Error("policies service was not generated");
        }

        // The undefined `Namespaces` type must be gone; the inlined array wins.
        const serviceText = serviceFile.getFullText();
        expect(serviceText).not.toMatch(/\bNamespaces\b/);
        expect(serviceText).toMatch(/Array<string>|string\[\]/);

        // Strip the insurance @ts-nocheck so the compile check is real.
        for (const sourceFile of project.getSourceFiles()) {
            const text = sourceFile.getFullText();
            if (text.includes("// @ts-nocheck")) {
                sourceFile.replaceWithText(text.replace("// @ts-nocheck\n", ""));
            }
        }

        const diagnostics = project.getPreEmitDiagnostics();
        const formatted = project.formatDiagnosticsWithColorAndContext(diagnostics);
        expect(formatted, `Generated code failed to compile:\n${formatted}`).toBe("");
    }, 120_000);
});
