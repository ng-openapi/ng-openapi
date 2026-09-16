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
 * `fixMissingImports()` or the diagnostics API on a file created here — the
 * first two rewrite it, the last crashes the checker. The script kinds are
 * what make the rest safe: `JSON` is a real TypeScript script kind, and
 * `Deferred` keeps the file out of the compiler program, so the checker,
 * `fixMissingImports()` and auto-import never see a README. Note that the
 * parser still runs on creation — a Deferred README is a (syntactically
 * broken) AST, not opaque text, which is why anything scanning the Project's
 * imports must skip non-TS script kinds (see listImportedPackageNames).
 */

/** Registers `value` as a two-space-indented JSON file. */
export function emitJsonFile(project: Project, filePath: string, value: unknown): void {
    project.createSourceFile(filePath, JSON.stringify(value, null, 2) + "\n", {
        overwrite: true,
        scriptKind: ScriptKind.JSON,
    });
}

/** Registers `text` verbatim as a non-TypeScript file. */
export function emitTextFile(project: Project, filePath: string, text: string): void {
    project.createSourceFile(filePath, text, { overwrite: true, scriptKind: ScriptKind.Deferred });
}
