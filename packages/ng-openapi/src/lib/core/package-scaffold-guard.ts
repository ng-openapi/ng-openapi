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
    if (isGeneratedPackageJson(path.join(outputRoot, "package.json"))) {
        return;
    }
    const conflicts = SCAFFOLD_FILES.map((file) => path.join(outputRoot, file)).filter((file) => fs.existsSync(file));
    if (conflicts.length === 0) {
        return;
    }
    throw new OutputConflictError(
        `Refusing to overwrite files in ${outputRoot} that ng-openapi did not generate: ` +
            `${conflicts.map((file) => path.basename(file)).join(", ")}. ` +
            `Point \`output\` at a directory of its own, or remove them if they are stale.`,
        conflicts,
    );
}

function isGeneratedPackageJson(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
        return false;
    }
    try {
        const manifest = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
        const marker = manifest[PACKAGE_JSON_MARKER_KEY] as { generated?: unknown } | undefined;
        return marker?.generated === true;
    } catch {
        // Unparsable is not ours either way; the conflict error names it
        return false;
    }
}
