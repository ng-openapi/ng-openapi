import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ModuleKind, Project, ScriptTarget } from "ts-morph";
import { expect } from "vitest";

/**
 * Shared type-check of a generated output directory, used by the URL-driven
 * compile-check suite and by the targeted regression tests. One copy so the
 * `@ts-nocheck` handling below cannot drift between them.
 */

/**
 * Temp roots must live outside node_modules: the generator resolves
 * auto-imports through the TypeScript language service, which ignores files
 * under a node_modules directory.
 */
export function generatedOutputRoot(): string {
    const root = join(process.cwd(), "tmp", "ng-openapi-tests");
    mkdirSync(root, { recursive: true });
    return root;
}

/**
 * A temp output directory plus best-effort cleanup. Returns the directory and
 * a disposer the caller registers with `afterAll`.
 */
export function createOutputDirs(): { create: (prefix: string) => string; cleanup: () => void } {
    const root = generatedOutputRoot();
    const dirs: string[] = [];
    return {
        create: (prefix: string) => {
            const dir = mkdtempSync(join(root, prefix));
            dirs.push(dir);
            return dir;
        },
        cleanup: () => {
            for (const dir of dirs) {
                try {
                    rmSync(dir, { recursive: true, force: true });
                } catch {
                    // best-effort cleanup
                }
            }
        },
    };
}

/**
 * Asserts every generated file in `outputDir` type-checks under `strict`.
 *
 * The shipped header carries `@ts-nocheck` as insurance for consumers with
 * exotic compiler settings, so it is stripped first — otherwise this asserts
 * nothing at all. The strip is verified to have fired: if the header text ever
 * changes, every compile assertion in the repo would silently become vacuous.
 */
export function expectGeneratedCodeCompiles(outputDir: string, label = "generated code"): void {
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

    project.addSourceFilesAtPaths(`${outputDir.replace(/\\/g, "/")}/**/*.ts`);
    const sourceFiles = project.getSourceFiles();
    expect(sourceFiles.length, `no generated files found for ${label}`).toBeGreaterThan(0);

    // Removes the whole directive line, whatever trails the token: an exact
    // `"// @ts-nocheck\n"` match silently no-ops against a header like
    // `// @ts-nocheck -- generated`, leaving the directive in force and every
    // assertion below vacuous.
    let stripped = 0;
    for (const sourceFile of sourceFiles) {
        const text = sourceFile.getFullText();
        const withoutDirective = text.replace(/^[ \t]*\/\/[ \t]*@ts-nocheck.*$\n?/gm, "");
        if (withoutDirective !== text) {
            sourceFile.replaceWithText(withoutDirective);
            stripped++;
        }
    }

    // Guards the guard, and counts only strips that actually changed the text.
    expect(stripped, `no @ts-nocheck header found to strip in ${label} — is the header still emitted?`).toBeGreaterThan(
        0,
    );

    // Belt and braces: one surviving directive suppresses that file's
    // diagnostics entirely, so the suite must not proceed with any left.
    const unstripped = project
        .getSourceFiles()
        .filter((sourceFile) => sourceFile.getFullText().includes("@ts-nocheck"))
        .map((sourceFile) => sourceFile.getBaseName());
    expect(unstripped, `@ts-nocheck survived the strip in ${label}, so nothing would be checked`).toEqual([]);

    const diagnostics = project.getPreEmitDiagnostics();
    const formatted = project.formatDiagnosticsWithColorAndContext(diagnostics);
    expect(formatted, `Generated ${label} failed to compile:\n${formatted}`).toBe("");
}
