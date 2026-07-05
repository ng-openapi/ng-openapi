import { Project } from "ts-morph";
import {
    GeneratorConfig,
    NormalizedOperation,
    pascalCase,
    REQUEST_PARAMS_GENERATOR_HEADER_COMMENT,
} from "@ng-openapi/shared";
import * as path from "path";
import { ServiceMethodParamsGenerator } from "./service-method";
import {
    RequestObjectEntry,
    ServiceMethodRequestObjectGenerator,
} from "./service-method/service-method-request-object.generator";

/**
 * Emits one exported interface per operation into `models/request-params.ts`
 * when `options.useSingleRequestParameter` is enabled. Operations without
 * parameters get no interface and keep their signature unchanged.
 */
export class RequestParamsGenerator {
    private project: Project;
    private paramsGenerator: ServiceMethodParamsGenerator;
    private readonly registry = new Map<NormalizedOperation, RequestObjectEntry>();
    private readonly usedInterfaceNames = new Set<string>();

    constructor(project: Project, config: GeneratorConfig) {
        this.project = project;
        this.paramsGenerator = new ServiceMethodParamsGenerator(config);
    }

    buildRegistry(
        controllerGroups: Record<string, NormalizedOperation[]>,
        getMethodName: (operation: NormalizedOperation) => string,
    ): Map<NormalizedOperation, RequestObjectEntry> {
        Object.entries(controllerGroups).forEach(([controllerName, operations]) => {
            operations.forEach((operation) => {
                const parameters = ServiceMethodRequestObjectGenerator.dedupe(
                    this.paramsGenerator.generateApiParameters(operation),
                );
                if (parameters.length === 0) {
                    return;
                }
                // The destructured properties share the method scope with the trailing
                // observe/options parameters, so those names would not compile
                const reserved = parameters.find((param) => param.name === "observe" || param.name === "options");
                if (reserved) {
                    throw new Error(
                        `Parameter name '${reserved.name}' conflicts with the reserved '${reserved.name}' method parameter when useSingleRequestParameter is enabled: (${operation.method}) ${operation.path}`,
                    );
                }
                const interfaceName = this.reserveInterfaceName(controllerName, getMethodName(operation));
                this.registry.set(operation, ServiceMethodRequestObjectGenerator.createEntry(interfaceName, parameters));
            });
        });
        return this.registry;
    }

    generate(outputRoot: string): void {
        if (this.registry.size === 0) {
            return;
        }

        const filePath = path.join(outputRoot, "models", "request-params.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        this.registry.forEach((entry, operation) => {
            sourceFile.addInterface({
                name: entry.interfaceName,
                isExported: true,
                properties: ServiceMethodRequestObjectGenerator.toInterfaceProperties(entry),
                docs: operation.description ? [operation.description] : undefined,
            });
        });

        // fixMissingImports before the header comment: inserting the first import
        // into a file that starts with plain comment text trips up ts-morph
        sourceFile.fixMissingImports().formatText();
        sourceFile.insertText(0, REQUEST_PARAMS_GENERATOR_HEADER_COMMENT);
        sourceFile.saveSync();

        this.addModelsBarrelExport(outputRoot);
    }

    /**
     * Method names are only unique per service class, so interfaces sharing the
     * global request-params file fall back to a controller-prefixed name on collision.
     */
    private reserveInterfaceName(controllerName: string, methodName: string): string {
        const base = `${pascalCase(methodName)}Params`;
        const candidates = [base, `${pascalCase(controllerName)}${base}`];
        for (const candidate of candidates) {
            if (!this.usedInterfaceNames.has(candidate)) {
                this.usedInterfaceNames.add(candidate);
                return candidate;
            }
        }
        let suffix = 2;
        while (this.usedInterfaceNames.has(`${candidates[1]}${suffix}`)) {
            suffix++;
        }
        const name = `${candidates[1]}${suffix}`;
        this.usedInterfaceNames.add(name);
        return name;
    }

    private addModelsBarrelExport(outputRoot: string): void {
        const modelsIndex = this.project.getSourceFile(path.join(outputRoot, "models", "index.ts"));
        if (!modelsIndex) {
            return;
        }
        modelsIndex.addExportDeclaration({ moduleSpecifier: "./request-params" });
        modelsIndex.formatText();
        modelsIndex.saveSync();
    }
}
