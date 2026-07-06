import { Project } from "ts-morph";
import * as path from "path";
import { listGeneratedFileNames, pascalCase, SERVICE_INDEX_GENERATOR_HEADER_COMMENT } from "@ng-openapi/shared";

export class ServiceIndexGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, "services");

        // Export what this run generated (from the Project, not the disk):
        // path-less specs produce no services and no services/ directory
        const serviceFiles = listGeneratedFileNames(this.project, servicesDir, ".service.ts");

        if (serviceFiles.length === 0) {
            return;
        }

        const indexPath = path.join(servicesDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

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
