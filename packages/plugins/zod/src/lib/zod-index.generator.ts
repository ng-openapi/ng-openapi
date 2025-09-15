import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";
import { ZOD_PLUGIN_INDEX_GENERATOR_HEADER_COMMENT } from "@ng-openapi/shared";

export class ZodIndexGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generateIndex(outputRoot: string): void {
        const validatorsDir = path.join(outputRoot, "validators");
        const indexPath = path.join(validatorsDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, ZOD_PLUGIN_INDEX_GENERATOR_HEADER_COMMENT);

        // Get all validator files
        const validatorFiles = fs
            .readdirSync(validatorsDir)
            .filter((file) => file.endsWith(".validator.ts"))
            .map((file) => file.replace(".validator.ts", ""));

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
