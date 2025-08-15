import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";
import { pascalCase, SERVICE_INDEX_GENERATOR_HEADER_COMMENT } from "@ng-openapi/shared";

export class ServiceIndexGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, "services");
        const indexPath = path.join(servicesDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        // get all service files
        const serviceFiles = fs
            .readdirSync(servicesDir)
            .filter((file) => file.endsWith(".service.ts"))
            .map((file) => file.replace(".service.ts", ""));

        // Add exports
        serviceFiles.forEach((serviceName) => {
            const className = pascalCase(serviceName) + "Service";
            sourceFile.addExportDeclaration({
                namedExports: [className],
                moduleSpecifier: `./${serviceName}.service`,
            });
        });

        sourceFile.saveSync();
    }
}
