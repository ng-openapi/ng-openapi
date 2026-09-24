import { Project, ScriptKind } from "ts-morph";

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

/**
 * Package names the generated code imports — every bare (non-relative)
 * static `import`/`export … from` specifier of every TypeScript file in the
 * Project, reduced to its package root (`@angular/common/http` →
 * `@angular/common`, `rxjs/operators` → `rxjs`). Dynamic `import()` is not
 * scanned; generated code never uses it. This is the peer-dependency set a
 * generated npm package must declare, read from the code itself rather than
 * from the config: a plugin that was configured but emitted nothing adds no
 * dependency, and a plugin the core has never heard of still gets its
 * imports listed. Sorted for deterministic output.
 */
export function listImportedPackageNames(project: Project): string[] {
    const names = new Set<string>();

    for (const sourceFile of project.getSourceFiles()) {
        // Files registered with emitJsonFile/emitTextFile are still parsed by
        // ts-morph, so a README containing the word `import` would otherwise
        // contribute a phantom peer — skip everything that is not real TS
        if (sourceFile.getScriptKind() !== ScriptKind.TS) {
            continue;
        }
        for (const declaration of [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]) {
            const specifier = declaration.getModuleSpecifierValue();
            if (!specifier || specifier.startsWith(".") || specifier.startsWith("node:")) {
                continue;
            }
            const segments = specifier.split("/");
            names.add(specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]);
        }
    }

    return [...names].sort();
}
