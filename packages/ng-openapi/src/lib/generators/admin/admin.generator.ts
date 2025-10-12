// packages/ng-openapi/src/lib/generators/admin/admin.generator.ts

import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import * as path from "path";
import { Project } from "ts-morph";
import { FormProperty, Resource } from "./admin.types";
import { discoverAdminResources } from "./resource-discovery";
import { writeListComponent } from "./component-writers/list-component.writer";
import { writeFormComponent } from "./component-writers/form-component.writer";
import { writeMasterAdminRoutes, writeResourceRoutes } from "./component-writers/routes.writer";
import { getTemplate } from './helpers/template.reader';

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

        const generatedResources: Resource[] = [];
        for (const resource of this.allResources) {
            console.log(`[ADMIN] Generating UI for resource: "${resource.name}"...`);

            const modelForPropsRef = resource.createModelRef || (resource.operations.read ? Object.entries(this.parser.getSpec().components.schemas).find(([name]) => name === resource.modelName)?.[1] : null);
            if (modelForPropsRef) {
                resource.formProperties = this.processSchemaToFormProperties(this.parser.resolveReference(modelForPropsRef));
            }

            const adminDir = path.join(outputRoot, "admin");

            if (resource.operations.list || resource.operations.create || resource.actions.some(a => a.level === 'collection')) {
                writeListComponent(resource, this.project, adminDir);
            }
            if (resource.operations.read || resource.operations.create || resource.operations.update) {
                const usesCustomValidators = resource.formProperties.some(p => p.validators.some(v => v.startsWith('CustomValidators')));
                if (usesCustomValidators && !this.customValidatorsCreated) {
                    this.createCustomValidatorsFile(adminDir);
                }
                writeFormComponent(resource, this.project, this.allResources, adminDir, usesCustomValidators);
            }

            writeResourceRoutes(resource, this.project, adminDir);
            generatedResources.push(resource);
        }

        writeMasterAdminRoutes(generatedResources, this.project, path.join(outputRoot, "admin"));
    }

    private createCustomValidatorsFile(adminDir: string) {
        const helpersDir = path.join(adminDir, "helpers");
        const filePath = path.join(helpersDir, "custom-validators.ts");
        const template = getTemplate("custom-validators.ts.template");
        this.project.createSourceFile(filePath, template, { overwrite: true }).saveSync();
        this.customValidatorsCreated = true;
    }

    private processSchemaToFormProperties(schema: any): FormProperty[] {
        const properties: FormProperty[] = [];
        if (!schema || !schema.properties) return properties;

        for (const propName in schema.properties) {
            const prop = schema.properties[propName];
            const isRequired = schema.required?.includes(propName) ?? false;
            // FIX: The validators array is now declared here, and subsequent checks append to it.
            const validators = isRequired ? ["Validators.required"] : [];

            if (prop.readOnly) continue;

            // Add numeric validators
            if (prop.minimum !== undefined) {
                if (prop.exclusiveMinimum) {
                    validators.push(`CustomValidators.exclusiveMin(${prop.minimum})`);
                } else {
                    validators.push(`Validators.min(${prop.minimum})`);
                }
            }
            if (prop.maximum !== undefined) {
                if (prop.exclusiveMaximum) {
                    validators.push(`CustomValidators.exclusiveMax(${prop.maximum})`);
                } else {
                    validators.push(`Validators.max(${prop.maximum})`);
                }
            }
            if (prop.multipleOf !== undefined) {
                validators.push(`CustomValidators.multipleOf(${prop.multipleOf})`);
            }

            if (prop.type === 'string' && prop.format === 'binary') {
                properties.push({
                    name: propName, type: 'file', inputType: 'file', required: isRequired,
                    validators, description: prop.description,
                });
                continue;
            }

            const subSchema = prop.$ref ? this.parser.resolveReference(prop.$ref) : prop;
            const refModelName = prop.$ref?.split('/').pop();
            const relatedResource = this.allResources.find(r => r.modelName === refModelName && r.operations.list);

            if (relatedResource) {
                properties.push({
                    name: propName, type: 'relationship', required: isRequired, validators,
                    relationResourceName: relatedResource.name, relationDisplayField: 'name', relationValueField: 'id',
                    relationServiceName: relatedResource.serviceName, relationListMethodName: relatedResource.operations.list!.methodName,
                    relationModelName: relatedResource.modelName,
                });
                continue;
            }

            if (subSchema.type === 'object' && subSchema.properties) {
                // Nested objects don't have validators on the group itself in this implementation
                properties.push({ name: propName, type: 'object', nestedProperties: this.processSchemaToFormProperties(subSchema), inputType: '', required: isRequired, validators: [] });
                continue;
            }

            // Handle array validators
            if (prop.type === 'array') {
                if (prop.minItems !== undefined) validators.push(`Validators.minLength(${prop.minItems})`);
                if (prop.maxItems !== undefined) validators.push(`Validators.maxLength(${prop.maxItems})`);
                if (prop.uniqueItems === true) validators.push(`CustomValidators.uniqueItems()`);
            }

            if (prop.type === 'array' && (prop.items?.$ref)) {
                const arrayItemSchema = this.parser.resolveReference(prop.items.$ref);
                properties.push({ name: propName, type: 'array_object', nestedProperties: this.processSchemaToFormProperties(arrayItemSchema), inputType: '', required: isRequired, validators });
                continue;
            }

            // Moved from below to apply to all remaining types, including arrays of strings
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
                    case "string": formProp.type = "string"; if (prop.format === "date" || prop.format === "date-time") formProp.inputType = "datepicker"; else if (prop.format === "password") formProp.inputType = "password"; else if (prop.format === "textarea") formProp.inputType = "textarea"; break;
                    case "array": formProp.type = "array"; if (prop.items?.type === "string" && prop.items?.enum) { formProp.inputType = "button-toggle-group"; formProp.enumValues = prop.items.enum; } else if (prop.items?.type === "string") { formProp.inputType = "chip-list"; } break;
                }
            }
            properties.push(formProp);
        }
        return properties;
    }
}
