import { GeneratorConfig, SwaggerParser, extractPaths, pascalCase, camelCase, PathInfo } from "@ng-openapi/shared";
import * as path from "path";
import * as fs from "fs";
import { Project } from "ts-morph";
import { FormProperty, Resource } from "./admin.types";
import { plural, titleCase } from "./admin.helpers";

// --- START: Helper Functions ---

function renderTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
        context[key] !== undefined ? String(context[key]) : placeholder
    );
}

function getInitialValue(p: FormProperty): string {
    if (p.defaultValue !== undefined) { return JSON.stringify(p.defaultValue); }
    if (!p.required) { return "null"; }
    switch (p.type) {
        case "boolean": return "false";
        case "number": return "0";
        case "array": return "[]";
        case "object": case "relationship": return "null"; // Objects and relations default to null
        case "string": case "enum": default: return JSON.stringify("");
    }
}

function generateFormControlsTS(properties: FormProperty[], createModelName: string): string {
    return properties.map(p => {
        if (p.type === 'object' && p.nestedProperties) {
            const nestedControls = generateFormControlsTS(p.nestedProperties, `${createModelName}['${p.name}']`);
            return `'${p.name}': new FormGroup({\n    ${nestedControls}\n})`;
        } else if (p.type === 'array_object' && p.nestedProperties) {
            const validators = p.required ? `, { validators: [Validators.required] }` : '';
            return `'${p.name}': new FormArray([]${validators})`;
        } else {
            const initialValue = getInitialValue(p);
            const options: string[] = [];
            if (p.validators.length > 0) { options.push(`validators: [${p.validators.join(", ")}]`); }
            if (p.required) { options.push("nonNullable: true"); }
            const optionsString = options.length > 0 ? `, { ${options.join(", ")} }` : "";
            const typeArgument = `${createModelName}['${p.name}']${p.required ? "" : " | null"}`;
            return `'${p.name}': new FormControl<${typeArgument}>(${initialValue}${optionsString})`;
        }
    }).join(',\n    ');
}

function generateFormFieldsHTML(properties: FormProperty[], materialModules: Set<string>, componentProviders: Set<string>, chipListSignals: { name: string, pascalName: string }[]): string {
    return properties.map(p => {
        const label = titleCase(p.name);
        const hint = p.description ? `<mat-hint>${p.description}</mat-hint>` : "";
        const errors = [
            p.required ? `@if (form.get('${p.name}')?.hasError('required')) { <mat-error>This field is required.</mat-error> }` : "",
            p.minLength ? `@if (form.get('${p.name}')?.hasError('minlength')) { <mat-error>Must be at least ${p.minLength} characters long.</mat-error> }` : "",
            p.maxLength ? `@if (form.get('${p.name}')?.hasError('maxlength')) { <mat-error>Cannot exceed ${p.maxLength} characters.</mat-error> }` : "",
            p.pattern ? `@if (form.get('${p.name}')?.hasError('pattern')) { <mat-error>Invalid format.</mat-error> }` : "",
        ].filter(Boolean).join("\n");

        if (p.type === 'relationship') {
            materialModules.add('MatSelectModule');
            materialModules.add('MatFormFieldModule');
            const signalName = `${p.relationResourceName}Items`;
            const displayField = p.relationDisplayField || 'name';
            const valueField = p.relationValueField || 'id';
            return `<mat-form-field appearance="outline">
  <mat-label>${label}</mat-label>
  <mat-select formControlName="${p.name}" [compareWith]="compareById">
    @for(item of ${signalName}(); track item.${valueField}) {
      <mat-option [value]="item">{{ item.${displayField} }}</mat-option>
    }
  </mat-select>
  ${hint}${errors}
</mat-form-field>`;
        }

        if (p.type === 'object' && p.nestedProperties) {
            materialModules.add('MatExpansionModule');
            const nestedHtml = generateFormFieldsHTML(p.nestedProperties, materialModules, componentProviders, chipListSignals);
            return `<mat-expansion-panel><mat-expansion-panel-header><mat-panel-title>${label}</mat-panel-title></mat-expansion-panel-header><div formGroupName="${p.name}" class="nested-form-group">${nestedHtml}</div></mat-expansion-panel>`;
        }

        if (p.type === 'array_object' && p.nestedProperties) {
            materialModules.add('MatExpansionModule');
            materialModules.add('MatButtonModule');
            materialModules.add('MatIconModule');
            const singularName = p.name.endsWith('s') ? p.name.slice(0, -1) : p.name;
            const nestedHtml = generateFormFieldsHTML(p.nestedProperties, materialModules, componentProviders, chipListSignals);
            return `
<div class="form-array-container">
  <div class="form-array-header">
    <h3>${label}</h3>
    <button mat-flat-button color="primary" type="button" (click)="add${pascalCase(singularName)}()">
      <mat-icon>add</mat-icon>
      <span>Add ${titleCase(singularName)}</span>
    </button>
  </div>
  <div formArrayName="${p.name}">
    @if(${p.name}.controls.length === 0 && form.get('${p.name}')?.hasError('required')) {
        <mat-error class="form-array-error">At least one ${titleCase(singularName)} is required.</mat-error>
    }
    @for(item of ${p.name}.controls; track $index) {
      <mat-expansion-panel [expanded]="true" class="form-array-panel">
        <mat-expansion-panel-header>
          <mat-panel-title>${titleCase(singularName)} {{ $index + 1 }}</mat-panel-title>
          <button mat-icon-button color="warn" type="button" (click)="remove${pascalCase(singularName)}($index)" matTooltip="Remove ${titleCase(singularName)}">
            <mat-icon>delete</mat-icon>
          </button>
        </mat-expansion-panel-header>
        <div [formGroupName]="$index" class="nested-form-group">
          ${nestedHtml}
        </div>
      </mat-expansion-panel>
    }
  </div>
</div>`;
        }

        switch (p.inputType) {
            case "checkbox": materialModules.add("MatCheckboxModule"); return `<mat-checkbox formControlName="${p.name}">${label}</mat-checkbox>`;
            case "slide-toggle": materialModules.add("MatSlideToggleModule"); return `<mat-slide-toggle formControlName="${p.name}">${label}</mat-slide-toggle>`;
            case "radio-group": { materialModules.add("MatRadioModule"); const radioButtons = p.enumValues?.map((val) => `<mat-radio-button value="${val}">${val}</mat-radio-button>`).join("\n"); return `<div class="group-container"><label class="mat-body-strong">${label}</label><mat-radio-group formControlName="${p.name}">${radioButtons}</mat-radio-group>${hint}</div>`; }
            case "select": { materialModules.add("MatSelectModule"); materialModules.add("MatFormFieldModule"); const options = p.enumValues?.map((val) => `  <mat-option value="${val}">${val}</mat-option>`).join("\n"); return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><mat-select formControlName="${p.name}">${options}</mat-select>${hint}${errors}</mat-form-field>`; }
            case "slider": materialModules.add("MatSliderModule"); return `<div class="group-container"><label class="mat-body-strong">${label}</label><mat-slider min="${p.min}" max="${p.max}" discrete="true" showTickMarks="true"><input matSliderThumb formControlName="${p.name}"></mat-slider>${hint}</div>`;
            case "chip-list": materialModules.add("MatChipsModule"); materialModules.add("MatFormFieldModule"); materialModules.add("MatIconModule"); materialModules.add("MatInputModule"); chipListSignals.push({ name: p.name, pascalName: pascalCase(p.name) }); return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><mat-chip-grid #chipGrid${pascalCase(p.name)}><mat-chip-listbox aria-label="Tag selection">@for(item of ${p.name}Signal(); track item){<mat-chip-row (removed)="remove${pascalCase(p.name)}(item)">{{item}}<button matChipRemove><mat-icon>cancel</mat-icon></button></mat-chip-row>}</mat-chip-listbox></mat-chip-grid><input placeholder="New tag..." [matChipInputFor]="chipGrid${pascalCase(p.name)}" (matChipInputTokenEnd)="add${pascalCase(p.name)}($event)"/>${hint}</mat-form-field>`;
            case "button-toggle-group": { materialModules.add("MatButtonToggleModule"); const toggles = p.enumValues?.map((val) => `<mat-button-toggle value="${val}">${val}</mat-button-toggle>`).join("\n"); return `<div class="group-container"><label class="mat-body-strong">${label}</label><mat-button-toggle-group formControlName="${p.name}" multiple>${toggles}</mat-button-toggle-group>${hint}</div>`; }
            case "datepicker": { materialModules.add("MatDatepickerModule"); materialModules.add("MatFormFieldModule"); materialModules.add("MatInputModule"); componentProviders.add("provideNativeDateAdapter()"); const pickerId = `picker${pascalCase(p.name)}`; return `<mat-form-field><mat-label>${label}</mat-label><input matInput [matDatepicker]="${pickerId}" formControlName="${p.name}"><mat-hint>MM/DD/YYYY</mat-hint><mat-datepicker-toggle matIconSuffix [for]="${pickerId}"></mat-datepicker-toggle><mat-datepicker #${pickerId}></mat-datepicker>${errors}</mat-form-field>`; }
            case "textarea": materialModules.add("MatFormFieldModule"); materialModules.add("MatInputModule"); return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><textarea matInput formControlName="${p.name}"></textarea>${hint}${errors}</mat-form-field>`;
            default: materialModules.add("MatFormFieldModule"); materialModules.add("MatInputModule"); return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><input matInput formControlName="${p.name}" type="${p.inputType}">${hint}${errors}</mat-form-field>`;
        }
    }).join("\n");
}

// --- END: Helper Functions ---

export class AdminGenerator {
    private readonly project: Project;
    private readonly parser: SwaggerParser;
    private readonly config: GeneratorConfig;
    private allResources: Resource[] = []; // Catalog of all identified resources

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        this.config = config;
        this.project = project;
        this.parser = parser;
    }

    private getTemplate(templateName: string): string {
        const testPath = path.join(__dirname, "templates", templateName);
        if (fs.existsSync(testPath)) { return fs.readFileSync(testPath, "utf8"); }
        const prodPath = path.join(__dirname, "..", "templates", templateName);
        if (fs.existsSync(prodPath)) { return fs.readFileSync(prodPath, "utf8"); }
        throw new Error(`CRITICAL: Template file "${templateName}" not found.`);
    }

    async generate(outputRoot: string): Promise<void> {
        console.log("[ADMIN] Starting admin component generation...");
        // First Pass: Collect all possible resources to build a catalog
        this.allResources = this.collectAllResources();

        if (this.allResources.length === 0) {
            console.warn("[ADMIN] No viable resources found. A resource to be generated needs at least a Create (POST) endpoint on a collection path that takes a single model body, identified by a common tag.");
            return;
        }

        // Second Pass: Generate components for each resource, using the full catalog to resolve relationships
        for (const resource of this.allResources) {
            console.log(`[ADMIN] Generating UI for resource: "${resource.name}"...`);
            // Enrich the resource with processed form properties, now with relationship info
            resource.formProperties = this.processSchemaToFormProperties(this.parser.resolveReference(resource.createModelRef!), this.allResources);

            const adminDir = path.join(outputRoot, "admin", resource.pluralName);
            if (resource.operations.list) { this.generateModernListComponent(resource, adminDir); }
            if (resource.operations.create || resource.operations.update) { this.generateModernFormComponent(resource, adminDir); }
            this.generateModernRoutes(resource, adminDir);
        }
    }

    private collectAllResources(): Resource[] {
        const paths = extractPaths(this.parser.getSpec().paths);
        console.log(`[ADMIN] Pass 1: Analyzing ${paths.length} API paths to build resource catalog...`);
        const tagGroups = new Map<string, PathInfo[]>();
        paths.forEach((p) => {
            const t = p.tags?.[0];
            if (t && !t.includes("_")) {
                if (!tagGroups.has(t)) tagGroups.set(t, []);
                tagGroups.get(t)!.push(p);
            }
        });

        const resources: Resource[] = [];
        for (const [tag, tagPaths] of tagGroups.entries()) {
            const isItemPath = (p: PathInfo) => /\{[^}]+\}$/.test(p.path);
            const createOp = tagPaths.find(p => p.method === 'POST' && !isItemPath(p) && (p.requestBody?.content?.['application/json']?.schema?.$ref || (p.parameters || []).find(param => param.in === 'body')?.schema?.$ref));

            const bodyParam = (createOp?.parameters || []).find(p => p.in === 'body');
            const schemaObject = bodyParam?.schema || createOp?.requestBody?.content?.['application/json']?.schema;
            const ref = schemaObject?.$ref;

            const listOp = tagPaths.find(p => p.method === 'GET' && !isItemPath(p) && p.responses?.['200']?.schema?.type === 'array');
            const mainModelSchemaName = listOp?.responses?.['200']?.schema?.items?.$ref?.split('/')?.pop();

            const refName = ref?.split('/').pop()!;
            const modelName = mainModelSchemaName || (refName?.startsWith('Create') ? refName.replace(/^Create/, '') : refName);

            const readOp = tagPaths.find(p => p.method === 'GET' && isItemPath(p));
            const updateOp = tagPaths.find(p => (p.method === 'PUT' || p.method === 'PATCH') && isItemPath(p)) || tagPaths.find(p => p.method === 'PUT' && !isItemPath(p));
            const deleteOp = tagPaths.find(p => p.method === 'DELETE' && isItemPath(p));
            const getIdParamName = (op: PathInfo | undefined) => op?.parameters?.find(p => p.in === 'path')?.name || 'id';
            const singularTag = tag.endsWith('s') && !tag.endsWith('ss') ? tag.slice(0, -1) : tag;

            const resource: Resource = {
                name: singularTag.toLowerCase(),
                className: pascalCase(singularTag),
                pluralName: plural(singularTag).toLowerCase(),
                titleName: titleCase(singularTag),
                serviceName: pascalCase(tag) + "Service",
                modelName: pascalCase(modelName) || '',
                createModelName: ref ? pascalCase(ref.split('/').pop()!) : '',
                createModelRef: ref,
                operations: {
                    list: listOp ? { methodName: this.getMethodName(listOp) } : undefined,
                    create: createOp ? { methodName: this.getMethodName(createOp), bodyParamName: bodyParam?.name } : undefined,
                    read: readOp ? { methodName: this.getMethodName(readOp), idParamName: getIdParamName(readOp) } : undefined,
                    update: updateOp ? { methodName: this.getMethodName(updateOp), idParamName: getIdParamName(updateOp), bodyParamName: (updateOp.parameters || []).find(p => p.in === 'body')?.name } : undefined,
                    delete: deleteOp ? { methodName: this.getMethodName(deleteOp), idParamName: getIdParamName(deleteOp) } : undefined,
                },
                formProperties: [],
                listColumns: [],
            };
            if(createOp || listOp) {
                const schemaForColumns = this.parser.resolveReference(ref || listOp?.responses?.['200']?.schema?.items?.$ref);
                if (schemaForColumns) {
                    resource.listColumns = Object.keys(schemaForColumns.properties || {}).filter(key => {
                        const propSchema = schemaForColumns.properties[key];
                        return propSchema.type !== 'object' && propSchema.type !== 'array' && !propSchema.$ref;
                    });
                }
            }
            if (createOp || listOp) {
                resources.push(resource);
            }
        }
        console.log(`[ADMIN] Pass 1 Complete: Identified ${resources.length} potential resources: ${resources.map((r) => r.name).join(", ") || "None"}.`);
        return resources.filter(r => r.createModelRef);
    }

    private getMethodName(operation: any): string {
        if (operation.operationId) return camelCase(operation.operationId);
        return `${camelCase(operation.path.replace(/[\/{}]/g, ""))}${pascalCase(operation.method)}`;
    }

    private processSchemaToFormProperties(schema: any, allResources: Resource[]): FormProperty[] {
        const properties: FormProperty[] = [];
        if (!schema || !schema.properties) return properties;

        for (const propName in schema.properties) {
            const prop = schema.properties[propName];
            const isRequired = schema.required?.includes(propName) ?? false;

            if (prop.readOnly) continue;

            const subSchema = prop.$ref ? this.parser.resolveReference(prop.$ref) : prop;
            const refModelName = prop.$ref?.split('/').pop();
            const relatedResource = allResources.find(r => r.modelName === refModelName && r.operations.list);

            if (relatedResource) {
                console.log(`[ADMIN] Detected relationship '${propName}' to resource '${relatedResource.name}'`);
                properties.push({
                    name: propName, type: 'relationship', required: isRequired,
                    validators: isRequired ? ["Validators.required"] : [],
                    relationResourceName: relatedResource.name, relationDisplayField: 'name', relationValueField: 'id',
                    relationServiceName: relatedResource.serviceName, relationListMethodName: relatedResource.operations.list!.methodName,
                    relationModelName: relatedResource.modelName,
                });
                continue;
            }

            // ===== BUG FIX IS HERE: Correctly identify nested objects from $ref or inline =====
            if (subSchema.type === 'object' && subSchema.properties) {
                properties.push({
                    name: propName, type: 'object',
                    nestedProperties: this.processSchemaToFormProperties(subSchema, allResources),
                    inputType: '', required: isRequired, validators: []
                });
                continue;
            }

            if (prop.type === 'array' && (prop.items?.$ref)) {
                const arrayItemSchema = this.parser.resolveReference(prop.items.$ref);
                properties.push({
                    name: propName, type: 'array_object',
                    nestedProperties: this.processSchemaToFormProperties(arrayItemSchema, allResources),
                    inputType: '', required: isRequired, validators: []
                });
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

    private generateModernListComponent(resource: Resource, dir: string) {
        // ... Method is unchanged, but included for completeness ...
        const listDir = path.join(dir, `${resource.pluralName}-list`);
        const compName = `${resource.pluralName}-list.component`;
        const htmlFile = this.project.createSourceFile(path.join(listDir, `${compName}.html`), "", { overwrite: true });
        const cssFile = this.project.createSourceFile(path.join(listDir, `${compName}.css`), "", { overwrite: true });
        const tsFile = this.project.createSourceFile(path.join(listDir, `${compName}.ts`), "", { overwrite: true });

        const idKey = resource.operations.read?.idParamName || resource.operations.delete?.idParamName || 'id';
        const createBtn = resource.operations.create ? `<button mat-flat-button color="primary" [routerLink]="['../new']"><mat-icon>add</mat-icon><span>Create ${resource.titleName}</span></button>` : '';
        const editBtn = (resource.operations.read || resource.operations.update) ? `<button mat-icon-button [routerLink]="['../', element.${idKey}]" matTooltip="View/Edit ${resource.titleName}"><mat-icon>edit</mat-icon></button>` : '';
        const deleteBtn = resource.operations.delete ? `<button mat-icon-button color="warn" (click)="delete(element.${idKey})" matTooltip="Delete ${resource.titleName}"><mat-icon>delete</mat-icon></button>` : '';
        const columnsTemplate = resource.listColumns.map((col) => `<ng-container matColumnDef="${col}"><th mat-header-cell *matHeaderCellDef>${titleCase(col)}</th><td mat-cell *matCellDef="let element">{{element.${col}}}</td></ng-container>`).join("\n");

        htmlFile.insertText(0, renderTemplate(this.getTemplate("list.component.html.template"), { ...resource, pluralTitleName: plural(resource.titleName), columnsTemplate, createButtonTemplate: createBtn, editButtonTemplate: editBtn, deleteButtonTemplate: deleteBtn }));
        cssFile.insertText(0, `:host { display: block; padding: 2rem; } .header-actions { display: flex; justify-content: flex-end; margin-bottom: 1rem; } .mat-elevation-z8 { width: 100%; } .actions-cell { width: 120px; text-align: right; }`);
        tsFile.addStatements(`/* eslint-disable */
import { Component, inject, signal, WritableSignal } from '@angular/core'; import { CommonModule } from '@angular/common'; import { RouterModule } from '@angular/router'; import { MatTableModule } from '@angular/material/table'; import { MatIconModule } from '@angular/material/icon'; import { MatButtonModule } from '@angular/material/button'; import { MatTooltipModule } from '@angular/material/tooltip'; import { ${resource.serviceName} } from '../../../services'; import { ${resource.modelName} } from '../../../models';
@Component({ selector: 'app-${resource.pluralName}-list', standalone: true, imports: [CommonModule, RouterModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule], templateUrl: './${compName}.html', styleUrls: ['./${compName}.css'] })
export class ${resource.className}ListComponent {
  private readonly svc = inject(${resource.serviceName}); readonly data: WritableSignal<${resource.modelName}[]> = signal([]); readonly displayedColumns: string[] = ['${resource.listColumns.join("', '")}', 'actions'];
  constructor() { this.loadData(); }
  loadData() { this.svc.${resource.operations.list!.methodName}({} as any).subscribe((d: any) => this.data.set(d)); }
  ${resource.operations.delete ? `delete(id: number | string): void { if (confirm('Are you sure?')) { this.svc.${resource.operations.delete.methodName}({ ${resource.operations.delete.idParamName}: id } as any).subscribe(() => this.loadData()); } }` : ''}
}`);
        tsFile.formatText();
        htmlFile.saveSync(); cssFile.saveSync(); tsFile.saveSync();
    }

    private generateModernFormComponent(resource: Resource, dir: string) {
        if (!resource.operations.create && !resource.operations.update) return;
        const formDir = path.join(dir, `${resource.name}-form`);
        const compName = `${resource.name}-form.component`;
        const htmlFile = this.project.createSourceFile(path.join(formDir, `${compName}.html`), "", { overwrite: true });
        const cssFile = this.project.createSourceFile(path.join(formDir, `${compName}.css`), "", { overwrite: true });
        const tsFile = this.project.createSourceFile(path.join(formDir, `${compName}.ts`), "", { overwrite: true });

        const coreModules = new Set(["CommonModule", "ReactiveFormsModule"]);
        const materialModules = new Set<string>();
        const componentProviders = new Set<string>();
        const chipListSignals: { name: string, pascalName: string }[] = [];

        const fields = generateFormFieldsHTML(resource.formProperties, materialModules, componentProviders, chipListSignals);

        materialModules.add("MatButtonModule"); materialModules.add("MatIconModule"); materialModules.add("MatTooltipModule");

        htmlFile.insertText(0, renderTemplate(this.getTemplate("form.component.html.template"), { titleName: resource.titleName, formFieldsTemplate: fields }));

        const cssContent = `:host { display: block; padding: 2rem; } .form-container { display: flex; flex-direction: column; gap: 1rem; max-width: 600px; } .nested-form-group { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 1rem; } .form-array-container { display: flex; flex-direction: column; gap: 1rem; border: 1px solid #e0e0e0; padding: 1rem; border-radius: 4px; } .form-array-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; } .form-array-panel { margin-bottom: 1rem !important; } .form-array-error { font-size: 75%; } .action-buttons { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; } mat-checkbox, mat-slide-toggle { margin-bottom: 0.5rem; } .group-container { display: flex; flex-direction: column; } .group-container label { margin-bottom: 0.5rem; } mat-radio-group { display: flex; gap: 1rem; }`;
        cssFile.insertText(0, cssContent);

        const formControlFields = generateFormControlsTS(resource.formProperties, resource.createModelName);

        // ===== NEW: Logic for handling relationships =====
        const relationshipProps = resource.formProperties.filter(p => p.type === 'relationship');
        const relationServices = new Map<string, string>();
        relationshipProps.forEach(p => relationServices.set(p.relationServiceName!, p.relationResourceName!));

        const relationServiceInjections = Array.from(relationServices.entries()).map(([serviceName, resName]) => `private readonly ${resName}Svc = inject(${serviceName});`).join('\n  ');

        const relationDataSignals = relationshipProps.map(p => `readonly ${p.relationResourceName}Items = signal<${p.relationModelName}[]>([]);`).join('\n  ');

        const relationDataFetches = Array.from(relationServices.entries()).map(([_, resName]) => `this.${resName}Svc.${this.allResources.find(r => r.name === resName)!.operations.list!.methodName}({} as any).subscribe(data => this.${resName}Items.set(data as any[]));`).join('\n    ');

        const canEdit = resource.operations.read && resource.operations.update;
        const chipListMethods = chipListSignals.map(p => `readonly ${p.name}Signal = (this.form.get('${p.name}')! as any).valueChanges.pipe(startWith(this.form.get('${p.name}')!.value || []));\nadd${p.pascalName}(event: MatChipInputEvent): void { const value = (event.value || '').trim(); if (value) { const current = this.form.get('${p.name}')!.value; this.form.get('${p.name}')!.setValue([...new Set([...(current || []), value])]); } event.chipInput!.clear(); }\nremove${p.pascalName}(item: string): void { const current = this.form.get('${p.name}')!.value; this.form.get('${p.name}')!.setValue(current.filter((i: string) => i !== item)); }`).join("\n");

        const formArrayMethods = resource.formProperties.filter(p => p.type === 'array_object' && p.nestedProperties).map(p => {
            const singularName = p.name.endsWith('s') ? p.name.slice(0, -1) : p.name;
            const singularPascal = pascalCase(singularName);
            const formGroupStructure = generateFormControlsTS(p.nestedProperties!, `${resource.createModelName}['${p.name}'][0]`);
            return `
get ${p.name}(): FormArray { return this.form.get('${p.name}') as FormArray; }
create${singularPascal}(): FormGroup {
  return new FormGroup({
    ${formGroupStructure}
  });
}
add${singularPascal}(): void { this.${p.name}.push(this.create${singularPascal}()); }
remove${singularPascal}(index: number): void { this.${p.name}.removeAt(index); }`;
        }).join('\n\n');

        let editModeLogic = `readonly isEditMode = computed(() => false); constructor() { ${relationDataFetches} }`;
        if (canEdit && resource.operations.read) {
            const formArrayPatchLogic = resource.formProperties
                .filter(p => p.type === 'array_object' && p.nestedProperties)
                .map(p => {
                    const singularPascal = pascalCase(p.name.endsWith('s') ? p.name.slice(0, -1) : p.name);
                    return `
            this.${p.name}.clear();
            (data as any).${p.name}?.forEach((item: any) => {
              const formGroup = this.create${singularPascal}();
              formGroup.patchValue(item as any);
              this.${p.name}.push(formGroup);
            });
            delete (data as any).${p.name};`;
                }).join('');

            const constructorBody = `
    ${relationDataFetches}
    effect(() => {
        const currentId = this.id();
        if (this.isEditMode() && currentId) {
          this.svc.${resource.operations.read!.methodName}({ ${resource.operations.read!.idParamName}: currentId } as any).subscribe(data => {
            ${formArrayPatchLogic}
            this.form.patchValue(data as any);
          });
        }
      });`;

            editModeLogic = `
                  readonly id = input<string | number>();
                  readonly isEditMode = computed(() => !!this.id());
                  constructor() { ${constructorBody} }`;
        }

        const createParam = resource.operations.create!.bodyParamName ? `${resource.operations.create!.bodyParamName}: formValue` : `body: formValue`;
        const updateParam = resource.operations.update?.bodyParamName ? `${resource.operations.update.bodyParamName}: formValue` : `body: formValue`;
        const updateIdParam = (canEdit && resource.operations.update?.idParamName) ? `, ${resource.operations.update.idParamName}: this.id()` : '';

        const submitLogic = `
              onSubmit(): void {
                this.form.markAllAsTouched();
                if (this.form.invalid) return;
                const formValue = this.form.getRawValue() as ${resource.createModelName};
                const action$ = ${(canEdit && resource.operations.update) ? `this.isEditMode()
                  ? this.svc.${resource.operations.update!.methodName}({ ${updateParam} ${updateIdParam} } as any)
                  :` : ""} this.svc.${resource.operations.create!.methodName}({ ${createParam} } as any);
                action$.subscribe(() => {
                    const navTarget = this.isEditMode() ? ['..'] : ['../'];
                    this.router.navigate(navTarget, { relativeTo: this.route });
                });
              }`;

        const materialImportsMap = { MatFormFieldModule: "@angular/material/form-field", MatInputModule: "@angular/material/input", MatButtonModule: "@angular/material/button", MatIconModule: "@angular/material/icon", MatCheckboxModule: "@angular/material/checkbox", MatSlideToggleModule: "@angular/material/slide-toggle", MatSelectModule: "@angular/material/select", MatRadioModule: "@angular/material/radio", MatSliderModule: "@angular/material/slider", MatChipsModule: "@angular/material/chips", MatButtonToggleModule: "@angular/material/button-toggle", MatDatepickerModule: "@angular/material/datepicker", MatExpansionModule: "@angular/material/expansion", MatTooltipModule: "@angular/material/tooltip" };
        const materialImports = Array.from(materialModules).map((mod) => `import { ${mod} } from '${materialImportsMap[mod as keyof typeof materialImportsMap]}';`).join("\n");

        const specialImports: string[] = [];
        if (chipListSignals.length > 0) { specialImports.push(`import { startWith } from 'rxjs';`); specialImports.push(`import { MatChipInputEvent } from '@angular/material/chips';`); }
        if (componentProviders.has("provideNativeDateAdapter()")) { specialImports.push(`import { provideNativeDateAdapter } from '@angular/material/core';`); }

        const allServiceNames = [resource.serviceName, ...Array.from(relationServices.keys())];
        const allModelNames = [resource.createModelName, ...relationshipProps.map(p => p.relationModelName!)];

        const providerDecor = componentProviders.size > 0 ? `\n  providers: [${Array.from(componentProviders).join(", ")}],` : "";
        const angularCoreImports = new Set(["Component", "inject", "computed", "signal"]);
        if (canEdit) { angularCoreImports.add("input"); angularCoreImports.add("effect"); }
        tsFile.addStatements(`/* eslint-disable */
import { ${Array.from(angularCoreImports).join(", ")} } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
${specialImports.join("\n")}
${materialImports}
import { ${[...new Set(allServiceNames)].join(", ")} } from '../../../services';
import { ${[...new Set(allModelNames)].join(", ")} } from '../../../models';

@Component({
  selector: 'app-${resource.name}-form',
  standalone: true,
  imports: [ ${[...coreModules, ...materialModules].join(", ")} ],${providerDecor}
  templateUrl: './${compName}.html',
  styleUrls: ['./${compName}.css']
})
export class ${resource.className}FormComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(${resource.serviceName});
  ${relationServiceInjections}
  
  ${relationDataSignals}

  readonly form = new FormGroup({
    ${formControlFields}
  });
  
  compareById = (o1: any, o2: any): boolean => o1?.id === o2?.id;

  ${editModeLogic}
  ${submitLogic}
  onCancel(): void { this.router.navigate(['..'], { relativeTo: this.route }); }
  ${chipListMethods}
  ${formArrayMethods}
}`);
        tsFile.formatText();
        htmlFile.saveSync(); cssFile.saveSync(); tsFile.saveSync();
    }

    private generateModernRoutes(resource: Resource, dir: string) {
        // ... Method is unchanged, but included for completeness ...
        const filePath = path.join(dir, `${resource.pluralName}.routes.ts`);
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });
        const routesName = `${resource.pluralName.toUpperCase()}_ROUTES`;
        const routeEntries = [];
        if (resource.operations.list) {
            routeEntries.push(`{ path: '', title: '${plural(resource.titleName)}', loadComponent: () => import('./${resource.pluralName}-list/${resource.pluralName}-list.component').then(m => m.${resource.className}ListComponent) }`);
        } else if (resource.operations.create) {
            routeEntries.push(`{ path: '', redirectTo: 'new', pathMatch: 'full' }`);
        }
        if (resource.operations.create) {
            routeEntries.push(`{ path: 'new', title: 'Create ${resource.titleName}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`);
        }
        if (resource.operations.read) {
            const idParam = resource.operations.read.idParamName;
            if (resource.operations.create || resource.operations.update) {
                routeEntries.push(`{ path: ':${idParam}', title: 'Edit ${resource.titleName}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`);
            }
        }
        sourceFile.addStatements(`/* eslint-disable */
import { Routes } from '@angular/router';
export const ${routesName}: Routes = [ ${routeEntries.join(",\n")} ];`);
        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
