import { Project } from "ts-morph";
import * as path from "path";
import { MAIN_INDEX_GENERATOR_HEADER_COMMENT } from "../../config";
import { GeneratorConfig } from "../../types";

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

            sourceFile.addExportDeclaration({
                moduleSpecifier: "./services",
            });

            sourceFile.addExportDeclaration({
                moduleSpecifier: "./utils/file-download",
            });

            // Export utilities conditionally
            if (this.config.options.dateType === "Date") {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./utils/date-transformer",
                });
            }
        }

        sourceFile.saveSync();
    }
}