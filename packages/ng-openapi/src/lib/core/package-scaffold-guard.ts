import * as fs from "fs";
import * as path from "path";
import { OutputConflictError } from "@ng-openapi/shared";
import { PACKAGE_JSON_MARKER_KEY } from "../generators/utility/package-scaffold.versions";

/** The files the npm package scaffold writes at the output root. */
export const SCAFFOLD_FILES = ["package.json", "ng-package.json", "tsconfig.json", "README.md", ".gitignore"] as const;

/**
 * Refuses to overwrite scaffold files ng-openapi did not write. Generated .ts
 * files collide with nothing; package.json, tsconfig.json and README.md
 * collide with almost every project root, so `output: "."` in a client repo
 * would silently replace the user's own package.json (ng-openapi in its
 * devDependencies included) and report success.
 *
 * Lives in the orchestrator, not the generator: it is the one place that
 * reads the output directory, and it runs before anything is written, so a
 * conflict leaves the directory untouched.
 *
 * The rule: the directory is ours if its package.json carries the marker the
 * scaffold stamps; then every scaffold file may be rewritten. Otherwise any
 * scaffold file already on disk is a conflict — including leftovers of ours
 * next to a package.json the user has since replaced, which is a real
 * ambiguity to resolve by hand rather than guess at.
 *
 * @throws OutputConflictError naming every file that would be overwritten.
 */
export function assertScaffoldTargetsWritable(outputRoot: string): void {
    const manifestPath = path.join(outputRoot, "package.json");
    const manifest = inspectPackageJson(manifestPath);
    if (manifest.generated) {
        return;
    }
    const conflicts = SCAFFOLD_FILES.map((file) => path.join(outputRoot, file)).filter((file) => fs.existsSync(file));
    if (conflicts.length === 0) {
        return;
    }
    // A package.json that could not be read is refused like a foreign one —
    // but the message must not call it foreign when the real problem is
    // permissions or a stray BOM
    const named = conflicts.map((file) =>
        file === manifestPath && manifest.problem
            ? `package.json (could not be read: ${manifest.problem})`
            : path.basename(file),
    );
    throw new OutputConflictError(
        `Refusing to overwrite files in ${outputRoot} that ng-openapi did not generate: ${named.join(", ")}. ` +
            `Point \`output\` at a directory of its own, or remove them if they are stale.`,
        conflicts,
    );
}

/** Whether the package.json at `filePath` carries the scaffold's marker; `problem` says why that could not be determined. */
function inspectPackageJson(filePath: string): { generated: boolean; problem?: string } {
    if (!fs.existsSync(filePath)) {
        return { generated: false };
    }
    try {
        const manifest = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
        const marker = manifest[PACKAGE_JSON_MARKER_KEY] as { generated?: unknown } | undefined;
        return { generated: marker?.generated === true };
    } catch (error) {
        return { generated: false, problem: error instanceof Error ? error.message : String(error) };
    }
}
