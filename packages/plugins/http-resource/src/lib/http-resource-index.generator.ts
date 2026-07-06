import { Project } from "ts-morph";
import * as path from "path";
import {
    getResourceClassName,
    listGeneratedFileNames,
    NameDecoration,
    SERVICE_INDEX_GENERATOR_HEADER_COMMENT,
} from "@ng-openapi/shared";

export class HttpResourceIndexGenerator {
    private project: Project;
    private readonly naming?: NameDecoration;

    constructor(project: Project, naming?: NameDecoration) {
        this.project = project;
        this.naming = naming;
    }

    generateIndex(outputRoot: string): void {
        const resourcesDir = path.join(outputRoot, "resources");

        // Export what this run generated (from the Project, not the disk):
        // path-less specs produce no resources and no resources/ directory
        const resourceFiles = listGeneratedFileNames(this.project, resourcesDir, ".resource.ts");

        if (resourceFiles.length === 0) {
            return;
        }

        const indexPath = path.join(resourcesDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        // Add exports
        resourceFiles.forEach((resourceName) => {
            const className = getResourceClassName(resourceName, this.naming);
            sourceFile.addExportDeclaration({
                namedExports: [className],
                moduleSpecifier: `./${resourceName}.resource`,
            });
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
