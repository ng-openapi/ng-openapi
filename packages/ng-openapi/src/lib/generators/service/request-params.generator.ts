import { Project, SourceFile } from "ts-morph";
import {
    emitDocs,
    MethodGenOptions,
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

    private readonly onWarning?: (message: string) => void;

    constructor(project: Project, config: MethodGenOptions, onWarning?: (message: string) => void) {
        this.project = project;
        this.onWarning = onWarning;
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
                const interfaceName = this.reserveInterfaceName(controllerName, getMethodName(operation));
                this.registry.set(
                    operation,
                    ServiceMethodRequestObjectGenerator.createEntry(interfaceName, parameters),
                );
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
                docs: emitDocs(operation.description),
            });
        });

        // Imports before the header comment: inserting the first import into a
        // file that starts with plain comment text trips up ts-morph
        this.addMissingImports(sourceFile);
        sourceFile.formatText();
        sourceFile.insertText(0, REQUEST_PARAMS_GENERATOR_HEADER_COMMENT);

        this.addModelsBarrelExport(outputRoot);
    }

    /**
     * `sourceFile.fixMissingImports()` fails with a tree-manipulation error when
     * the first statement of the file carries a JSDoc (as the interfaces here do),
     * so the same language-service code fix is applied as a plain text edit instead.
     */
    private addMissingImports(sourceFile: SourceFile): void {
        const changes = this.project
            .getLanguageService()
            .getCombinedCodeFix(sourceFile, "fixMissingImport")
            .getChanges()
            .filter((fileChange) => fileChange.getFilePath() === sourceFile.getFilePath())
            .flatMap((fileChange) => fileChange.getTextChanges())
            .sort((a, b) => b.getSpan().getStart() - a.getSpan().getStart());
        if (changes.length === 0) {
            return;
        }
        let text = sourceFile.getFullText();
        changes.forEach((change) => {
            const span = change.getSpan();
            text =
                text.slice(0, span.getStart()) + change.getNewText() + text.slice(span.getStart() + span.getLength());
        });
        sourceFile.replaceWithText(text);
    }

    /**
     * Method names are only unique per service class, so interfaces sharing the
     * global request-params file fall back to a controller-prefixed name on collision.
     */
    private reserveInterfaceName(controllerName: string, methodName: string): string {
        const base = `${pascalCase(methodName)}Params`;
        const candidates = [base, `${pascalCase(controllerName)}${base}`];
        if (!this.usedInterfaceNames.has(base)) {
            this.usedInterfaceNames.add(base);
            return base;
        }
        const warnRenamed = (name: string): string => {
            this.usedInterfaceNames.add(name);
            // An exported type in the consumer's import graph, named by what
            // else the spec declares — a breaking change to call sites if silent.
            this.onWarning?.(
                `Request-parameter interface "${base}" is already taken; the parameters of "${methodName}" in ` +
                    `${controllerName} are exposed as "${name}". Renaming the operationId keeps the type name stable.`,
            );
            return name;
        };
        if (!this.usedInterfaceNames.has(candidates[1])) {
            return warnRenamed(candidates[1]);
        }
        let suffix = 2;
        while (this.usedInterfaceNames.has(`${candidates[1]}${suffix}`)) {
            suffix++;
        }
        return warnRenamed(`${candidates[1]}${suffix}`);
    }

    private addModelsBarrelExport(outputRoot: string): void {
        const modelsIndex = this.project.getSourceFile(path.join(outputRoot, "models", "index.ts"));
        if (!modelsIndex) {
            return;
        }
        modelsIndex.addExportDeclaration({ moduleSpecifier: "./request-params" });
        modelsIndex.formatText();
    }
}
