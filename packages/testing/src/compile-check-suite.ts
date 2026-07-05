import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ModuleKind, Project, ScriptTarget } from "ts-morph";
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
        // Must live outside node_modules: the generator adds imports via the
        // TypeScript language service, which refuses to auto-import from files
        // it considers external libraries — anything under a node_modules dir.
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

        for (const { label, envVar } of SPEC_SOURCES) {
            const specUrl = process.env[envVar];

            it.skipIf(!specUrl)(
                `generates compilable code from ${label} spec`,
                async () => {
                    const outputDir = mkdtempSync(join(tmpRoot, "out-"));
                    tempDirs.push(outputDir);

                    await generateFromConfig(buildConfig(specUrl as string, outputDir));

                    const project = new Project({
                        compilerOptions: {
                            target: ScriptTarget.ES2022,
                            module: ModuleKind.Preserve,
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

                    // Guard against a broken glob silently checking nothing
                    expect(project.getSourceFiles().length, "no generated files found").toBeGreaterThan(0);

                    const diagnostics = project.getPreEmitDiagnostics();
                    const formatted = project.formatDiagnosticsWithColorAndContext(diagnostics);

                    expect(formatted, `Generated ${label} code failed to compile:\n${formatted}`).toBe("");
                },
                120_000,
            );
        }
    });
}
