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

        // Export all tokens
        sourceFile.addExportDeclaration({
            moduleSpecifier: "./tokens",
        });

        // Export provider functions (always available)
        sourceFile.addExportDeclaration({
            moduleSpecifier: "./providers",
        });

        // Only export services if they were generated
        if (this.config.options.generateServices !== false) {
            sourceFile.addExportDeclaration({
                moduleSpecifier: "./services",
            });
        }

        // Export utilities conditionally
        if (this.config.options.dateType === "Date") {
            sourceFile.addExportDeclaration({
                moduleSpecifier: "./utils/date-transformer",
            });
        }

        sourceFile.addExportDeclaration({
            moduleSpecifier: "./utils/file-download",
        });

        sourceFile.saveSync();
    }
}