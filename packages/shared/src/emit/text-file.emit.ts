import { Project, ScriptKind } from "ts-morph";

/**
 * Non-TypeScript files (package.json, README.md, .gitignore) still go through
 * the shared ts-morph Project: it is the manifest of what a run generated
 * (`filesWritten`), and `generateFromConfig` saves it exactly once, so a
 * failure later in the run leaves nothing half-written — the same guarantee
 * every .ts file gets. Writing these files straight to disk would break both.
 *
 * ts-morph keeps a file's text verbatim as long as nothing edits it, so the
 * only rule is that nothing may: never call `formatText()`,
 * `fixMissingImports()` or the diagnostics API on a file created here. The
 * script kinds below are what make that safe — `JSON` is a real TypeScript
 * script kind, and `Deferred` marks a file the language service never parses,
 * so a README containing `export` is not mistaken for a module by the
 * auto-import machinery the .ts generators rely on.
 */

/** Registers `value` as a two-space-indented JSON file. */
export function emitJsonFile(project: Project, filePath: string, value: unknown): void {
    project.createSourceFile(filePath, JSON.stringify(value, null, 2) + "\n", {
        overwrite: true,
        scriptKind: ScriptKind.JSON,
    });
}

/** Registers `text` verbatim as an opaque, non-TypeScript file. */
export function emitTextFile(project: Project, filePath: string, text: string): void {
    project.createSourceFile(filePath, text, { overwrite: true, scriptKind: ScriptKind.Deferred });
}
