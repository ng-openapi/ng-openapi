import { Project } from "ts-morph";

/**
 * Lists the base names (with `suffix` stripped) of the source files the
 * current generation registered under `directoryPath`.
 *
 * The ts-morph Project — not the on-disk directory — is the source of truth
 * for what this run generated: a directory nothing was written to yields []
 * instead of ENOENT, and stale files from earlier runs never leak into the
 * result. Sorted for deterministic output.
 */
export function listGeneratedFileNames(project: Project, directoryPath: string, suffix: string): string[] {
    const directory = project.getDirectory(directoryPath);

    if (!directory) {
        return [];
    }

    return directory
        .getSourceFiles()
        .map((file) => file.getBaseName())
        .filter((baseName) => baseName.endsWith(suffix))
        .map((baseName) => baseName.slice(0, -suffix.length))
        .sort();
}

/**
 * Lists the base names of the direct child directories of `rootPath` that the
 * current generation gave an `index.ts` barrel.
 *
 * Same source-of-truth rule as listGeneratedFileNames: only directories
 * registered in the ts-morph Project count, so stale directories on disk from
 * earlier runs never leak into the result. Sorted for deterministic output.
 */
export function listGeneratedBarrelDirs(project: Project, rootPath: string): string[] {
    const root = project.getDirectory(rootPath);

    if (!root) {
        return [];
    }

    return root
        .getDirectories()
        .filter((directory) => directory.getSourceFile("index.ts") !== undefined)
        .map((directory) => directory.getBaseName())
        .sort();
}
