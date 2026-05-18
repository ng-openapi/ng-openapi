import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from "ts-morph";
import { afterAll, describe, expect, it } from "vitest";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";

const SPEC_SOURCES = [
    { label: "OpenAPI 2.0", envVar: "OPENAPI_SPEC_V2_URL" },
    { label: "OpenAPI 3.0", envVar: "OPENAPI_SPEC_V3_URL" },
    { label: "OpenAPI 3.1", envVar: "OPENAPI_SPEC_V3_1_URL" },
] as const;

type ConfigBuilder = (input: string, output: string) => GeneratorConfig;

export function registerCompileCheckSuite(suiteName: string, buildConfig: ConfigBuilder): void {
    describe(suiteName, () => {
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

        for (const { label, envVar } of SPEC_SOURCES) {
            const specUrl = process.env[envVar];

            it.skipIf(!specUrl)(
                `generates compilable code from ${label} spec`,
                async () => {
                    const outputDir = mkdtempSync(join(tmpdir(), "ng-openapi-test-"));
                    tempDirs.push(outputDir);

                    await generateFromConfig(buildConfig(specUrl as string, outputDir));

                    const project = new Project({
                        compilerOptions: {
                            target: ScriptTarget.ES2022,
                            module: ModuleKind.ESNext,
                            moduleResolution: ModuleResolutionKind.Bundler,
                            strict: true,
                            skipLibCheck: true,
                            lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
                            experimentalDecorators: true,
                            emitDecoratorMetadata: true,
                            noEmit: true,
                        },
                    });

                    const globPath = `${outputDir.replace(/\\/g, "/")}/**/*.ts`;
                    project.addSourceFilesAtPaths(globPath);

                    const diagnostics = project.getPreEmitDiagnostics();
                    const formatted = project.formatDiagnosticsWithColorAndContext(diagnostics);

                    expect(formatted, `Generated ${label} code failed to compile:\n${formatted}`).toBe("");
                },
                120_000,
            );
        }
    });
}
