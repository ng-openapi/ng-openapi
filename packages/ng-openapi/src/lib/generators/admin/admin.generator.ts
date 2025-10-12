import { GeneratorConfig, SwaggerParser, SwaggerDefinition, pascalCase } from "@ng-openapi/shared";
import * as path from "path";
import { Project } from "ts-morph";
import { FormProperty, PolymorphicOption, Resource } from "./admin.types";
import { discoverAdminResources } from "./resource-discovery";
import { writeListComponent } from "./component-writers/list-component.writer";
import { writeFormComponent } from "./component-writers/form-component.writer";
import { writeMasterAdminRoutes, writeResourceRoutes } from "./component-writers/routes.writer";
import { getTemplate } from './helpers/template.reader';

/**
 * Generates the TypeScript definition string for an inline interface.
 * e.g., "export interface PetCategory { id?: number; name?: string; }"
 * @param properties The properties of the inline object.
 * @returns A string representing the interface definition.
 */
function generateInterfaceDefinition(properties: FormProperty[]): string {
    const props = properties.map(p => {
        let type: string;
        switch (p.type) {
            case 'number': type = 'number'; break;
            case 'boolean': type = 'boolean'; break;
            case 'array_object': type = `${p.arrayItemModelName}[]`; break;
            case 'array': type = 'string[]'; break;
            case 'object': type = p.nestedObjectTypeName!; break;
            default: type = 'string'; break;
        }
        return `    ${p.name}${p.required ? '' : '?'}: ${type};`;
    }).join('\n');
    return `{\n${props}\n}`;
}

export class AdminGenerator {
    private readonly project: Project;
    private readonly parser: SwaggerParser;
    private readonly config: GeneratorConfig;
    private allResources: Resource[] = [];
    private customValidatorsCreated = false;

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        this.config = config;
        this.project = project;
        this.parser = parser;
    }

    async generate(outputRoot: string): Promise<void> {
        console.log("[ADMIN] Starting admin component generation...");
        this.allResources = discoverAdminResources(this.parser);

        if (this.allResources.length === 0) {
            console.warn("[ADMIN] No viable resources found.");
            return;
        }

        for (const resource of this.allResources) {
            console.log(`[ADMIN] Generating UI for resource: "${resource.name}"...`);

            let schemaToProcess: SwaggerDefinition | undefined;
            if (resource.createModelRef) {
                schemaToProcess = this.parser.resolveReference(resource.createModelRef);
            } else if (resource.modelName) {
                schemaToProcess = this.parser.getDefinition(resource.modelName);
            }

            if (schemaToProcess) {
                resource.inlineInterfaces = [];
                resource.formProperties = this.processSchemaToFormProperties(schemaToProcess, resource.createModelName || resource.modelName, resource);
            } else {
                resource.formProperties = [];
            }

            const adminDir = path.join(outputRoot, "admin");

            if (resource.operations.list || resource.operations.create || resource.actions.some(a => a.level === 'collection')) {
                writeListComponent(resource, this.project, adminDir);
            }
            if (resource.createModelName || resource.operations.read) {
                const usesCustomValidators = resource.formProperties.some(p => p.validators.some(v => v.startsWith('CustomValidators')));
                if (usesCustomValidators && !this.customValidatorsCreated) {
                    this.createCustomValidatorsFile(adminDir);
                }
                writeFormComponent(resource, this.project, this.allResources, adminDir, usesCustomValidators);
            }

            writeResourceRoutes(resource, this.project, adminDir);
        }

        writeMasterAdminRoutes(this.allResources, this.project, path.join(outputRoot, "admin"));
    }

    private createCustomValidatorsFile(adminDir: string) {
        const helpersDir = path.join(adminDir, "helpers");
        const filePath = path.join(helpersDir, "custom-validators.ts");
        const template = getTemplate("custom-validators.ts.template");
        this.project.createSourceFile(filePath, template, { overwrite: true }).saveSync();
        this.customValidatorsCreated = true;
    }

    /**
     * This is the core logic engine for converting an OpenAPI schema into a list of FormProperty objects.
     * It uses a rigid if/else if/else chain to ensure each property is processed by exactly one logic path,
     * which prevents bugs like duplicate key generation.
     */
    private processSchemaToFormProperties(schema: SwaggerDefinition, parentModelName: string, resource: Resource): FormProperty[] {
        const properties: FormProperty[] = [];
        if (!schema || !schema.properties) return properties;

        for (const propName in schema.properties) {
            const prop: SwaggerDefinition = schema.properties[propName];
            if (prop.readOnly) continue;

            const isRequired = schema.required?.includes(propName) ?? false;
            const validators = isRequired ? ["Validators.required"] : [];

            const subSchemas = prop.oneOf || prop.anyOf;
            const subSchema = prop.$ref ? this.parser.resolveReference(prop.$ref) : prop;
            const refModelName = prop.$ref?.split('/').pop();
            const relatedResource = this.allResources.find(r => r.modelName === refModelName && r.operations.list);

            // This rigid if/else if/else chain is critical. It ensures that a property
            // is only ever processed by one of the following logic blocks.
            if (subSchemas) {
                const polymorphicOptions: PolymorphicOption[] = [];
                for (const subSchemaRef of subSchemas) {
                    const subSchemaName = subSchemaRef.$ref.split('/').pop()!;
                    const resolvedSubSchema = this.parser.resolveReference(subSchemaRef.$ref);
                    if (resolvedSubSchema) {
                        polymorphicOptions.push({ name: subSchemaName, properties: this.processSchemaToFormProperties(resolvedSubSchema, subSchemaName, resource) });
                    }
                }
                properties.push({ name: propName, type: 'polymorphic', inputType: '', required: isRequired, validators, polymorphicOptions });
            } else if (relatedResource) {
                properties.push({ name: propName, type: 'relationship', inputType: '', required: isRequired, validators, relationResourceName: relatedResource.name, relationDisplayField: 'name', relationValueField: 'id', relationServiceName: relatedResource.serviceName, relationListMethodName: relatedResource.operations.list!.methodName, relationModelName: relatedResource.modelName });
            } else if (subSchema && subSchema.type === 'object' && subSchema.properties) {
                const interfaceName = `${pascalCase(parentModelName)}${pascalCase(propName)}`;
                const nestedProperties = this.processSchemaToFormProperties(subSchema, interfaceName, resource);
                resource.inlineInterfaces!.push({ name: interfaceName, definition: `export interface ${interfaceName} ${generateInterfaceDefinition(nestedProperties)}` });
                properties.push({ name: propName, type: 'object', nestedProperties, nestedObjectTypeName: interfaceName, inputType: '', required: isRequired, validators });
            } else if (prop.type === 'array' && prop.items?.$ref) {
                const arrayItemSchema = this.parser.resolveReference(prop.items.$ref);
                if (arrayItemSchema) {
                    const itemModelName = prop.items.$ref.split('/').pop()!;
                    properties.push({ name: propName, type: 'array_object', arrayItemModelName: pascalCase(itemModelName), nestedProperties: this.processSchemaToFormProperties(arrayItemSchema, pascalCase(itemModelName), resource), inputType: '', required: isRequired, validators, defaultValue: prop.default });
                }
            } else if (prop.type === 'file' || (prop.type === 'string' && prop.format === 'binary')) {
                properties.push({ name: propName, type: 'file', inputType: 'file', required: isRequired, validators, description: prop.description });
            } else {
                // This is the fallback for all "simple" properties (string, number, boolean, enum, etc.)
                if (prop.minimum !== undefined) validators.push(prop.exclusiveMinimum ? `CustomValidators.exclusiveMin(${prop.minimum})` : `Validators.min(${prop.minimum})`);
                if (prop.maximum !== undefined) validators.push(prop.exclusiveMaximum ? `CustomValidators.exclusiveMax(${prop.maximum})` : `Validators.max(${prop.maximum})`);
                if (prop.multipleOf !== undefined) validators.push(`CustomValidators.multipleOf(${prop.multipleOf})`);
                if (prop.type === 'array') {
                    if (prop.minItems !== undefined) validators.push(`Validators.minLength(${prop.minItems})`);
                    if (prop.maxItems !== undefined) validators.push(`Validators.maxLength(${prop.maxItems})`);
                    if (prop.uniqueItems === true) validators.push(`CustomValidators.uniqueItems()`);
                }
                if (prop.minLength) validators.push(`Validators.minLength(${prop.minLength})`);
                if (prop.maxLength) validators.push(`Validators.maxLength(${prop.maxLength})`);
                if (prop.pattern) {
                    const escapedPattern = prop.pattern.replace(/\\/g, "\\\\");
                    validators.push(`Validators.pattern(/${escapedPattern}/)`);
                }

                const formProp: FormProperty = {
                    name: propName, type: "string", inputType: "text", required: isRequired,
                    validators, description: prop.description, defaultValue: prop.default, minLength: prop.minLength,
                    maxLength: prop.maxLength, pattern: prop.pattern, enumValues: prop.enum, min: prop.minimum, max: prop.maximum,
                };
                if (prop.enum) {
                    formProp.type = "enum";
                    formProp.inputType = prop.enum.length <= 4 ? "radio-group" : "select";
                } else {
                    switch (prop.type) {
                        case "boolean": formProp.type = "boolean"; formProp.inputType = (this.config.options.admin as any)?.booleanType === "slide-toggle" ? "slide-toggle" : "checkbox"; break;
                        case "number": case "integer": formProp.type = "number"; formProp.inputType = formProp.min !== undefined && formProp.max !== undefined && !prop.exclusiveMinimum && !prop.exclusiveMaximum ? "slider" : "number"; break;
                        case "string": formProp.type = "string"; if (prop.format === "date" || prop.format === "date-time") formProp.inputType = "datepicker"; else if (prop.format === "password") formProp.inputType = "password"; else if (prop.format?.includes('textarea')) formProp.inputType = "textarea"; break;
                        case "array": formProp.type = "array"; if (prop.items?.type === "string" && prop.items?.enum) { formProp.inputType = "button-toggle-group"; formProp.enumValues = prop.items.enum; } else if (prop.items?.type === "string") { formProp.inputType = "chip-list"; } break;
                    }
                }
                properties.push(formProp);
            }
        }
        return properties;
    }
}
