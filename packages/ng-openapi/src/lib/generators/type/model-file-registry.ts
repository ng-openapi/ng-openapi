import { kebabCase } from "@ng-openapi/shared";

/**
 * Reserves a collision-free kebab-case file name per raw schema name for
 * per-type model generation. File names derive from the undecorated raw
 * name (naming.models decorates identifiers only). First-declared schema
 * wins the plain name; later collisions get a numeric suffix and a warning,
 * mirroring RequestParamsGenerator.reserveInterfaceName's policy.
 */
export class ModelFileRegistry {
    private readonly fileNameByRawName = new Map<string, string>();
    private readonly usedFileNames = new Set<string>();
    private readonly onWarning?: (message: string) => void;

    constructor(onWarning?: (message: string) => void) {
        this.onWarning = onWarning;
    }

    /** Reserves a literal file name (the sdk-types file, claimed ahead of user schemas). */
    reserveExact(fileName: string): string {
        this.usedFileNames.add(fileName);
        return fileName;
    }

    reserveForSchema(rawName: string): string {
        const base = sanitizeFileBaseName(kebabCase(rawName));
        let fileName = base;
        if (this.usedFileNames.has(fileName)) {
            let suffix = 2;
            while (this.usedFileNames.has(`${base}-${suffix}`)) {
                suffix++;
            }
            fileName = `${base}-${suffix}`;
            this.onWarning?.(
                `Model "${rawName}" maps to the file name "${base}.ts", which is already taken — ` +
                    `writing "${fileName}.ts" instead. Rename one of the schemas to avoid depending on declaration order.`,
            );
        }
        this.usedFileNames.add(fileName);
        this.fileNameByRawName.set(rawName, fileName);
        return fileName;
    }

    fileNameFor(rawName: string): string | undefined {
        return this.fileNameByRawName.get(rawName);
    }

    get schemaFileNames(): string[] {
        return [...this.fileNameByRawName.values()];
    }
}

/**
 * kebabCase only collapses `-_` and whitespace, so raw names like
 * "api.response" keep their dot; file names additionally strip anything
 * outside [a-z0-9-].
 */
function sanitizeFileBaseName(base: string): string {
    const cleaned = base
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    return cleaned || "model";
}
