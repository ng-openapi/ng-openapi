import { Project } from "ts-morph";
import { expect } from "vitest";

/**
 * Asserts no generated file declares `name` at any scope.
 *
 * Parsed, not pattern-matched: ts-morph emits a JSDoc block inline, so injected
 * code never starts a line and a `/^\s*export const X/m` assertion cannot see
 * the definition-level case at all — which is how a live injection sat in a
 * green suite. Compilation cannot see it either, because the injected code is
 * valid TypeScript; only asking the AST what was declared can.
 */
export function expectNoDeclaration(outputDir: string, name: string): void {
    const project = new Project({ useInMemoryFileSystem: false });
    project.addSourceFilesAtPaths(`${outputDir.replace(/\\/g, "/")}/**/*.ts`);
    const files = project.getSourceFiles();
    expect(files.length, "no generated files found").toBeGreaterThan(0);

    const offenders = files
        .filter((file) => file.getVariableDeclaration(name) || file.getFunction(name) || file.getClass(name))
        .map((file) => file.getBaseName());

    expect(offenders, `${name} was declared in generated output`).toEqual([]);
}
