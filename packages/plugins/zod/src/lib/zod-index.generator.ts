import { Project } from "ts-morph";
import * as path from "path";
import { listGeneratedFileNames, ZOD_PLUGIN_INDEX_GENERATOR_HEADER_COMMENT } from "@ng-openapi/shared";

export class ZodIndexGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generateIndex(outputRoot: string): void {
        const validatorsDir = path.join(outputRoot, "validators");

        // Export what this run generated (from the Project, not the disk):
        // path-less specs produce no validators and no validators/ directory
        const validatorFiles = listGeneratedFileNames(this.project, validatorsDir, ".validator.ts");

        if (validatorFiles.length === 0) {
            return;
        }

        const indexPath = path.join(validatorsDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, ZOD_PLUGIN_INDEX_GENERATOR_HEADER_COMMENT);

        // Add exports
        validatorFiles.forEach((fileName) => {
            sourceFile.addExportDeclaration({
                moduleSpecifier: `./${fileName}.validator`,
            });
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
