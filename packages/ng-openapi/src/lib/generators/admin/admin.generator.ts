// packages/ng-openapi/src/lib/generators/admin/admin.generator.ts

import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import * as path from "path";
import { Project } from "ts-morph";
import { FormProperty, Resource } from "./admin.types";
import { discoverAdminResources } from "./resource-discovery";
import { writeListComponent } from "./component-writers/list-component.writer";
import { writeFormComponent } from "./component-writers/form-component.writer";
import { writeMasterAdminRoutes, writeResourceRoutes } from "./component-writers/routes.writer";

export class AdminGenerator {
    private readonly project: Project;
    private readonly parser: SwaggerParser;
    private readonly config: GeneratorConfig;
    private allResources: Resource[] = [];

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
                writeFormComponent(resource, this.project, this.allResources, adminDir);
            }

            writeResourceRoutes(resource, this.project, adminDir);
            generatedResources.push(resource);
        }

        writeMasterAdminRoutes(generatedResources, this.project, path.join(outputRoot, "admin"));
    }

    private processSchemaToFormProperties(schema: any): FormProperty[] {
        const properties: FormProperty[] = [];
        if (!schema || !schema.properties) return properties;

        for (const propName in schema.properties) {
            const prop = schema.properties[propName];
            const isRequired = schema.required?.includes(propName) ?? false;

            if (prop.readOnly) continue;

            const subSchema = prop.$ref ? this.parser.resolveReference(prop.$ref) : prop;
            const refModelName = prop.$ref?.split('/').pop();
            const relatedResource = this.allResources.find(r => r.modelName === refModelName && r.operations.list);

            if (relatedResource) {
                properties.push({
                    name: propName, type: 'relationship', required: isRequired,
                    validators: isRequired ? ["Validators.required"] : [],
                    relationResourceName: relatedResource.name, relationDisplayField: 'name', relationValueField: 'id',
                    relationServiceName: relatedResource.serviceName, relationListMethodName: relatedResource.operations.list!.methodName,
                    relationModelName: relatedResource.modelName,
                });
                continue;
            }

            if (subSchema.type === 'object' && subSchema.properties) {
                properties.push({ name: propName, type: 'object', nestedProperties: this.processSchemaToFormProperties(subSchema), inputType: '', required: isRequired, validators: [] });
                continue;
            }

            if (prop.type === 'array' && (prop.items?.$ref)) {
                const arrayItemSchema = this.parser.resolveReference(prop.items.$ref);
                properties.push({ name: propName, type: 'array_object', nestedProperties: this.processSchemaToFormProperties(arrayItemSchema), inputType: '', required: isRequired, validators: [] });
                continue;
            }

            const formProp: FormProperty = {
                name: propName, type: "string", inputType: "text", required: isRequired,
                validators: isRequired ? ["Validators.required"] : [], description: prop.description, defaultValue: prop.default, minLength: prop.minLength,
                maxLength: prop.maxLength, pattern: prop.pattern, enumValues: prop.enum, min: prop.minimum, max: prop.maximum,
            };
            if (prop.minLength) formProp.validators.push(`Validators.minLength(${prop.minLength})`);
            if (prop.maxLength) formProp.validators.push(`Validators.maxLength(${prop.maxLength})`);
            if (prop.pattern) {
                const escapedPattern = prop.pattern.replace(/\\/g, "\\\\");
                formProp.validators.push(`Validators.pattern(/${escapedPattern}/)`);
            }
            if (prop.enum) {
                formProp.type = "enum";
                formProp.inputType = prop.enum.length <= 4 ? "radio-group" : "select";
            } else {
                switch (prop.type) {
                    case "boolean": formProp.type = "boolean"; formProp.inputType = (this.config.options.admin as any)?.booleanType === "slide-toggle" ? "slide-toggle" : "checkbox"; break;
                    case "number": case "integer": formProp.type = "number"; formProp.inputType = formProp.min !== undefined && formProp.max !== undefined ? "slider" : "number"; break;
                    case "string": formProp.type = "string"; if (prop.format === "date" || prop.format === "date-time") formProp.inputType = "datepicker"; else if (prop.format === "password") formProp.inputType = "password"; else if (prop.format === "textarea") formProp.inputType = "textarea"; break;
                    case "array": if (prop.items?.type === "string" && prop.items?.enum) { formProp.type = "array"; formProp.inputType = "button-toggle-group"; formProp.enumValues = prop.items.enum; } else if (prop.items?.type === "string") { formProp.type = "array"; formProp.inputType = "chip-list"; } break;
                }
            }
            properties.push(formProp);
        }
        return properties;
    }
}
