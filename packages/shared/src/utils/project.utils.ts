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
