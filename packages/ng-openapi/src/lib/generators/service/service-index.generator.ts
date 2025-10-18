import { Project } from "ts-morph";
import * as path from "path"; // Keep path for basename manipulation
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

        // Get the directory from the project, which works for both in-memory and real file systems.
        const servicesDirectory = this.project.getDirectory(servicesDir);
        if (!servicesDirectory) {
            // If the directory doesn't exist in the project, no services were generated.
            sourceFile.saveSync();
            return;
        }

        // Get all service files from the ts-morph project instead of the file system.
        const serviceFiles = servicesDirectory.getSourceFiles()
            .filter(sf => sf.getFilePath().endsWith('.service.ts'))
            .map(sf => path.basename(sf.getFilePath()).replace('.service.ts', ''));
        // ===========================

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
