import { Project } from "ts-morph";
import * as path from "path";
import {
    GeneratorConfig,
    listGeneratedBarrelDirs,
    listGeneratedFileNames,
    MAIN_INDEX_GENERATOR_HEADER_COMMENT,
} from "@ng-openapi/shared";

// Top-level directories the core generators own; everything else with an
// index.ts barrel under the output root came from a plugin
const CORE_BARREL_DIRS = new Set(["models", "services", "tokens", "utils"]);

export class MainIndexGenerator {
    private project: Project;
    private config: GeneratorConfig;

    constructor(project: Project, config: GeneratorConfig) {
        this.project = project;
        this.config = config;
    }

    generateMainIndex(outputRoot: string): void {
        const indexPath = path.join(outputRoot, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        // Add header comment
        sourceFile.insertText(0, MAIN_INDEX_GENERATOR_HEADER_COMMENT);

        // Export all models
        sourceFile.addExportDeclaration({
            moduleSpecifier: "./models",
        });

        // Only export services if they were generated
        if (this.config.options.generateServices !== false) {
            // Export all tokens
            sourceFile.addExportDeclaration({
                moduleSpecifier: "./tokens",
            });

            // Export provider functions (always available)
            sourceFile.addExportDeclaration({
                moduleSpecifier: "./providers",
            });

            // A path-less spec generates no services (and no services/index.ts
            // to re-export), even with generateServices enabled
            const servicesDir = path.join(outputRoot, "services");
            if (listGeneratedFileNames(this.project, servicesDir, ".service.ts").length > 0) {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./services",
                });
            }

            sourceFile.addExportDeclaration({
                moduleSpecifier: "./utils/file-download",
            });

            sourceFile.addExportDeclaration({
                moduleSpecifier: "./utils/http-params-builder",
            });

            // Export utilities conditionally
            if (this.config.options.dateType === "Date") {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./utils/date-transformer",
                });
            }
        }

        // Export plugin barrels (e.g. resources/ from @ng-openapi/http-resource,
        // validators/ from @ng-openapi/zod). Outside the generateServices gate
        // above because plugins run unconditionally, so a generateServices:false
        // run can still emit self-contained plugin output
        listGeneratedBarrelDirs(this.project, outputRoot)
            .filter((dir) => !CORE_BARREL_DIRS.has(dir))
            .forEach((dir) => {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: `./${dir}`,
                });
            });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
