import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";
import { pascalCase, SERVICE_INDEX_GENERATOR_HEADER_COMMENT } from "@ng-openapi/shared";

export class HttpResourceIndexGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, "resources");
        const indexPath = path.join(servicesDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        // get all service files
        const serviceFiles = fs
            .readdirSync(servicesDir)
            .filter((file) => file.endsWith(".resource.ts"))
            .map((file) => file.replace(".resource.ts", ""));

        // Add exports
        serviceFiles.forEach((serviceName) => {
            const className = pascalCase(serviceName) + "Resource";
            sourceFile.addExportDeclaration({
                namedExports: [className],
                moduleSpecifier: `./${serviceName}.resource`,
            });
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
