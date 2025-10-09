import { camelCase, extractPaths, GeneratorConfig, pascalCase, PathInfo, SwaggerParser } from "@ng-openapi/shared";
import * as path from "path";
import * as fs from "fs";
import { Project } from "ts-morph";
import { FormProperty, Resource } from "./admin.types";
import { plural, titleCase } from "./admin.helpers";

function renderTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
        context[key] !== undefined ? String(context[key]) : placeholder
    );
}

export class AdminGenerator {
    private readonly project: Project;
    private readonly parser: SwaggerParser;
    private readonly config: GeneratorConfig;

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        this.config = config;
        this.project = project;
        this.parser = parser;
    }

    private getTemplate(templateName: string): string {
        const testPath = path.join(__dirname, "templates", templateName);
        if (fs.existsSync(testPath)) {
            return fs.readFileSync(testPath, "utf8");
        }
        const prodPath = path.join(__dirname, "..", "templates", templateName);
        if (fs.existsSync(prodPath)) {
            return fs.readFileSync(prodPath, "utf8");
        }
        throw new Error(`CRITICAL: Template file "${templateName}" not found.`);
    }

    async generate(outputRoot: string): Promise<void> {
        console.log("[ADMIN] Starting admin component generation...");
        const resources = this.collectResources();
        if (resources.length === 0) {
            console.warn(
                "[ADMIN] No viable resources found. A resource needs at least a List (GET) and Create (POST) endpoint on a collection path, identified by a common tag."
            );
            return;
        }
        for (const resource of resources) {
            console.log(`[ADMIN] Generating UI for resource: "${resource.name}"...`);
            const adminDir = path.join(outputRoot, "admin", resource.pluralName);
            this.generateModernListComponent(resource, adminDir);
            this.generateModernFormComponent(resource, adminDir);
            this.generateModernRoutes(resource, adminDir);
        }
    }

    public collectResources(): Resource[] {
        const paths = extractPaths(this.parser.getSpec().paths);
        console.log(`[ADMIN] Analyzing ${paths.length} API paths by grouping them by tag...`);
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
            const isCollectionPath = (p: PathInfo) => !/\{[^}]+\}$/.test(p.path);
            const isItemPath = (p: PathInfo) => /\{[^}]+\}$/.test(p.path);
            const listOp = tagPaths.find((p) => p.method === "GET" && isCollectionPath(p));
            const createOp = tagPaths.find((p) => p.method === "POST" && isCollectionPath(p));
            if (!listOp || !createOp) {
                console.log(
                    `[ADMIN] Skipping tag "${tag}": Missing required List (GET) or Create (POST) on a collection path.`
                );
                continue;
            }
            const readOp = tagPaths.find((p) => p.method === "GET" && isItemPath(p));
            const updateOp = tagPaths.find((p) => (p.method === "PUT" || p.method === "PATCH") && isItemPath(p));
            const deleteOp = tagPaths.find((p) => p.method === "DELETE" && isItemPath(p));
            const schemaObject = createOp.requestBody?.content?.["application/json"]?.schema;
            if (!schemaObject) continue;
            let finalSchema: any, modelName: string | undefined;
            if (schemaObject.$ref) {
                modelName = schemaObject.$ref
                    .split("/")
                    .pop()
                    ?.replace(/^Create/, "");
                finalSchema = this.parser.resolveReference(schemaObject.$ref);
            } else {
                continue;
            }
            if (!finalSchema || !modelName) continue;
            const getIdParamName = (op: PathInfo | undefined) =>
                op?.parameters?.find((p) => p.in === "path")?.name || "id";

            const singularTag = tag.endsWith("s") && !tag.endsWith("ss") ? tag.slice(0, -1) : tag;

            const resource: Resource = {
                name: singularTag.toLowerCase(),
                className: pascalCase(singularTag),
                pluralName: plural(singularTag).toLowerCase(),
                titleName: titleCase(singularTag),
                serviceName: pascalCase(tag) + "Service",
                modelName: pascalCase(modelName),
                operations: {
                    list: { methodName: this.getMethodName(listOp) },
                    create: { methodName: this.getMethodName(createOp) },
                    read: readOp
                        ? { methodName: this.getMethodName(readOp), idParamName: getIdParamName(readOp) }
                        : undefined,
                    update:
                        updateOp && readOp
                            ? { methodName: this.getMethodName(updateOp), idParamName: getIdParamName(readOp) }
                            : undefined,
                    delete: deleteOp
                        ? { methodName: this.getMethodName(deleteOp), idParamName: getIdParamName(deleteOp) }
                        : undefined,
                },
                formProperties: this.processSchemaToFormProperties(finalSchema),
                listColumns: Object.keys(finalSchema.properties || {}),
            };
            resources.push(resource);
        }
        console.log(
            `[ADMIN] Identified ${resources.length} viable resources: ${
                resources.map((r) => r.name).join(", ") || "None"
            }.`
        );
        return resources;
    }

    private getMethodName(operation: any): string {
        if (operation.operationId) return camelCase(operation.operationId);
        return `${camelCase(operation.path.replace(/[\/{}]/g, ""))}${pascalCase(operation.method)}`;
    }

    private processSchemaToFormProperties(schema: any): FormProperty[] {
        const properties: FormProperty[] = [];
        if (!schema || !schema.properties) return properties;
        for (const propName in schema.properties) {
            const prop = schema.properties[propName];
            const isRequired = schema.required?.includes(propName) ?? false;

            const formProp: FormProperty = {
                name: propName,
                type: "string",
                inputType: "text",
                required: isRequired,
                validators: isRequired ? ["Validators.required"] : [],
                description: prop.description,
                defaultValue: prop.default,
                minLength: prop.minLength,
                maxLength: prop.maxLength,
                pattern: prop.pattern,
                enumValues: prop.enum,
                min: prop.minimum,
                max: prop.maximum,
            };

            if (prop.minLength) formProp.validators.push(`Validators.minLength(${prop.minLength})`);
            if (prop.maxLength) formProp.validators.push(`Validators.maxLength(${prop.maxLength})`);
            if (prop.pattern) formProp.validators.push(`Validators.pattern(/${prop.pattern}/)`);

            if (prop.enum) {
                formProp.type = "enum";
                formProp.inputType = prop.enum.length <= 4 ? "radio-group" : "select";
            } else {
                switch (prop.type) {
                    case "boolean":
                        formProp.type = "boolean";
                        formProp.inputType =
                            (this.config.options.admin as any)?.booleanType === "slide-toggle"
                                ? "slide-toggle"
                                : "checkbox";
                        break;
                    case "number":
                    case "integer":
                        formProp.type = "number";
                        formProp.inputType =
                            formProp.min !== undefined && formProp.max !== undefined ? "slider" : "number";
                        break;
                    case "string":
                        formProp.type = "string";
                        if (prop.format === "date" || prop.format === "date-time") formProp.inputType = "datepicker";
                        else if (prop.format === "password") formProp.inputType = "password";
                        else if (prop.format === "textarea") formProp.inputType = "textarea";
                        break;
                    case "array":
                        if (prop.items?.type === "string" && prop.items?.enum) {
                            formProp.type = "array";
                            formProp.inputType = "button-toggle-group";
                            formProp.enumValues = prop.items.enum;
                        } else if (prop.items?.type === "string") {
                            formProp.type = "array";
                            formProp.inputType = "chip-list";
                        }
                        break;
                }
            }
            properties.push(formProp);
        }
        return properties;
    }

    private getInitialValue(p: FormProperty): string {
        // FIX: Default value from spec takes precedence over everything.
        if (p.defaultValue !== undefined) {
            return JSON.stringify(p.defaultValue);
        }
        if (!p.required) {
            return "null";
        }
        // Sane fallbacks for required fields without a default.
        switch (p.type) {
            case "boolean":
                return "false";
            case "number":
                return "0";
            case "array":
                return "[]";
            case "string":
            case "enum":
            default:
                return JSON.stringify("");
        }
    }

    private generateModernListComponent(resource: Resource, dir: string) {
        const listDir = path.join(dir, `${resource.pluralName}-list`);
        const compName = `${resource.pluralName}-list.component`;
        const htmlFile = this.project.createSourceFile(path.join(listDir, `${compName}.html`), "", { overwrite: true });
        const cssFile = this.project.createSourceFile(path.join(listDir, `${compName}.css`), "", { overwrite: true });
        const tsFile = this.project.createSourceFile(path.join(listDir, `${compName}.ts`), "", { overwrite: true });

        const idKey = resource.operations.read?.idParamName || resource.operations.delete?.idParamName || "name";
        const createBtn = resource.operations.create
            ? `<button mat-flat-button color="primary" [routerLink]="['new']"><mat-icon>add</mat-icon><span>Create ${resource.titleName}</span></button>`
            : "";
        const editBtn = resource.operations.update
            ? `<button mat-icon-button [routerLink]="[element.${idKey}, 'edit']" matTooltip="Edit ${resource.titleName}"><mat-icon>edit</mat-icon></button>`
            : "";
        const deleteBtn = resource.operations.delete
            ? `<button mat-icon-button color="warn" (click)="delete(element.${idKey})" matTooltip="Delete ${resource.titleName}"><mat-icon>delete</mat-icon></button>`
            : "";
        const columnsTemplate = resource.listColumns
            .map(
                (col) =>
                    `<ng-container matColumnDef="${col}"><th mat-header-cell *matHeaderCellDef>${titleCase(
                        col
                    )}</th><td mat-cell *matCellDef="let element">{{element.${col}}}</td></ng-container>`
            )
            .join("\n");
        htmlFile.insertText(
            0,
            renderTemplate(this.getTemplate("list.component.html.template"), {
                ...resource,
                pluralTitleName: plural(resource.titleName),
                columnsTemplate,
                createButtonTemplate: createBtn,
                editButtonTemplate: editBtn,
                deleteButtonTemplate: deleteBtn,
            })
        );
        cssFile.insertText(
            0,
            `:host { display: block; padding: 2rem; } .header-actions { display: flex; justify-content: flex-end; margin-bottom: 1rem; } .mat-elevation-z8 { width: 100%; } .actions-cell { width: 120px; text-align: right; }`
        );
        tsFile.addStatements(`/* eslint-disable */
import { Component, inject, signal, WritableSignal } from '@angular/core'; import { CommonModule } from '@angular/common'; import { RouterModule } from '@angular/router'; import { MatTableModule } from '@angular/material/table'; import { MatIconModule } from '@angular/material/icon'; import { MatButtonModule } from '@angular/material/button'; import { MatTooltipModule } from '@angular/material/tooltip'; import { ${
            resource.serviceName
        } } from '../../../services'; import { ${resource.modelName} } from '../../../models';
@Component({ selector: 'app-${
            resource.pluralName
        }-list', standalone: true, imports: [CommonModule, RouterModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule], templateUrl: './${compName}.html', styleUrls: ['./${compName}.css'] })
export class ${resource.className}ListComponent {
  private readonly svc = inject(${resource.serviceName}); readonly data: WritableSignal<${
            resource.modelName
        }[]> = signal([]); readonly displayedColumns: string[] = ['${resource.listColumns.join("', '")}', 'actions'];
  constructor() { this.loadData(); }
  loadData() { this.svc.${resource.operations.list!.methodName}().subscribe((d: any) => this.data.set(d.${
            resource.pluralName
        } || d.profiles || d.repos || d)); }
  ${
      resource.operations.delete
          ? `delete(id: number | string): void { if (confirm('Are you sure?')) { this.svc.${resource.operations.delete.methodName}({ ${resource.operations.delete.idParamName}: id } as any).subscribe(() => this.loadData()); } }`
          : ""
  }
}`);

        tsFile.formatText();
        htmlFile.saveSync();
        cssFile.saveSync();
        tsFile.saveSync();
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
        let hasChipList = false;
        let hasDatepicker = false;

        const fields = resource.formProperties
            .map((p) => {
                const label = titleCase(p.name);
                const hint = p.description ? `<mat-hint>${p.description}</mat-hint>` : "";
                const errors = [
                    p.required
                        ? `\n@if (form.get('${p.name}')?.hasError('required')) {
    <mat-error>This field is required.</mat-error>
}\n`
                        : "",
                    p.minLength
                        ? `\n@if (form.get('${p.name}')?.hasError('minlength')) {
    <mat-error>Must be at least ${p.minLength} characters long.</mat-error>
}\n`
                        : "",
                    p.maxLength
                        ? `\n@if (form.get('${p.name}')?.hasError('maxlength')) {
    <mat-error>Cannot exceed ${p.maxLength} characters.</mat-error>
}\n`
                        : "",
                    p.pattern
                        ? `\n@if (form.get('${p.name}')?.hasError('pattern')) {
    <mat-error>Invalid format.</mat-error>
}\n`
                        : "",
                ]
                    .filter(Boolean)
                    .join("\n");

                switch (p.inputType) {
                    case "checkbox":
                        materialModules.add("MatCheckboxModule");
                        return `<mat-checkbox formControlName="${p.name}">${label}</mat-checkbox>`;
                    case "slide-toggle":
                        materialModules.add("MatSlideToggleModule");
                        return `<mat-slide-toggle formControlName="${p.name}">${label}</mat-slide-toggle>`;
                    case "radio-group": {
                        materialModules.add("MatRadioModule");
                        const radioButtons = p.enumValues
                            ?.map((val) => `<mat-radio-button value="${val}">${val}</mat-radio-button>`)
                            .join("\n");
                        return `<div class="group-container"><label class="mat-body-strong">${label}</label><mat-radio-group formControlName="${p.name}">${radioButtons}</mat-radio-group>${hint}</div>`;
                    }
                    case "select": {
                        materialModules.add("MatSelectModule");
                        materialModules.add("MatFormFieldModule");
                        const options = p.enumValues
                            ?.map((val) => `  <mat-option value="${val}">${val}</mat-option>`)
                            .join("\n");
                        return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><mat-select formControlName="${p.name}">${options}</mat-select>${hint}${errors}</mat-form-field>`;
                    }
                    case "slider":
                        materialModules.add("MatSliderModule");
                        return `<div class="group-container"><label class="mat-body-strong">${label}</label><mat-slider min="${p.min}" max="${p.max}" discrete="true" showTickMarks="true"><input matSliderThumb formControlName="${p.name}"></mat-slider>${hint}</div>`;
                    case "chip-list":
                        materialModules.add("MatChipsModule");
                        materialModules.add("MatFormFieldModule");
                        materialModules.add("MatIconModule");
                        materialModules.add("MatInputModule");
                        hasChipList = true;
                        return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><mat-chip-grid #chipGrid${pascalCase(
                            p.name
                        )}><mat-chip-listbox aria-label="Tag selection">@for(item of ${
                            p.name
                        }(); track item){<mat-chip-row (removed)="remove${pascalCase(
                            p.name
                        )}(item)">{{item}}<button matChipRemove><mat-icon>cancel</mat-icon></button></mat-chip-row>}</mat-chip-listbox></mat-chip-grid><input placeholder="New tag..." [matChipInputFor]="chipGrid${pascalCase(
                            p.name
                        )}" (matChipInputTokenEnd)="add${pascalCase(p.name)}($event)"/>${hint}</mat-form-field>`;
                    case "button-toggle-group": {
                        materialModules.add("MatButtonToggleModule");
                        const toggles = p.enumValues
                            ?.map((val) => `<mat-button-toggle value="${val}">${val}</mat-button-toggle>`)
                            .join("\n");
                        return `<div class="group-container"><label class="mat-body-strong">${label}</label><mat-button-toggle-group formControlName="${p.name}" multiple>${toggles}</mat-button-toggle-group>${hint}</div>`;
                    }
                    case "datepicker": {
                        materialModules.add("MatDatepickerModule");
                        materialModules.add("MatFormFieldModule");
                        materialModules.add("MatInputModule");
                        componentProviders.add("provideNativeDateAdapter()");
                        hasDatepicker = true;
                        const pickerId = `picker${pascalCase(p.name)}`;
                        return `<mat-form-field><mat-label>${label}</mat-label><input matInput [matDatepicker]="${pickerId}" formControlName="${p.name}"><mat-hint>MM/DD/YYYY</mat-hint><mat-datepicker-toggle matIconSuffix [for]="${pickerId}"></mat-datepicker-toggle><mat-datepicker #${pickerId}></mat-datepicker>${errors}</mat-form-field>`;
                    }
                    case "textarea":
                        materialModules.add("MatFormFieldModule");
                        materialModules.add("MatInputModule");
                        return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><textarea matInput formControlName="${p.name}"></textarea>${hint}${errors}</mat-form-field>`;
                    default:
                        materialModules.add("MatFormFieldModule");
                        materialModules.add("MatInputModule");
                        return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><input matInput formControlName="${p.name}" type="${p.inputType}">${hint}${errors}</mat-form-field>`;
                }
            })
            .join("\n");

        materialModules.add("MatButtonModule");
        materialModules.add("MatIconModule");

        htmlFile.insertText(
            0,
            renderTemplate(this.getTemplate("form.component.html.template"), {
                titleName: resource.titleName,
                formFieldsTemplate: fields,
            })
        );
        cssFile.insertText(
            0,
            `:host { display: block; padding: 2rem; } .form-container { display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; } .action-buttons { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; } mat-checkbox, mat-slide-toggle { margin: 0.5rem 0; } .group-container { display: flex; flex-direction: column; margin: 0.5rem 0; } .group-container label { margin-bottom: 0.5rem; } mat-radio-group { display: flex; gap: 1rem; }`
        );

        const createModelName = `Create${resource.modelName}`;

        const formControlFields = resource.formProperties
            .map((p) => {
                const initialValue = this.getInitialValue(p);

                const options: string[] = [];
                if (p.validators.length > 0) {
                    options.push(`validators: [${p.validators.join(", ")}]`);
                }
                if (p.required) {
                    options.push("nonNullable: true");
                }
                const optionsString = options.length > 0 ? `, { ${options.join(", ")} }` : "";
                const typeArgument = `${createModelName}['${p.name}']${p.required ? "" : " | null"}`;

                return `'${p.name}': new FormControl<${typeArgument}>(${initialValue}${optionsString})`;
            })
            .join(",\n    ");

        const canEdit = resource.operations.read && resource.operations.update;
        const chipListMethods = hasChipList
            ? resource.formProperties
                  .filter((p) => p.inputType === "chip-list")
                  .map(
                      (p) => `
readonly ${p.name} = (this.form.get('${p.name}')! as any).valueChanges.pipe(startWith(this.form.get('${
                          p.name
                      }')!.value || []));
add${pascalCase(
                          p.name
                      )}(event: MatChipInputEvent): void { const value = (event.value || '').trim(); if (value) { const current = this.form.get('${
                          p.name
                      }')!.value as any[]; this.form.get('${
                          p.name
                      }')!.setValue([...new Set([...current, value])]); } event.chipInput!.clear(); }
remove${pascalCase(p.name)}(item: string): void { const current = this.form.get('${
                          p.name
                      }')!.value as any[]; this.form.get('${p.name}')!.setValue(current.filter(i => i !== item)); }`
                  )
                  .join("\n")
            : "";

        const editModeLogic = canEdit
            ? `
              readonly id = input<string | number>();
              readonly isEditMode = computed(() => !!this.id());
              constructor() {
                effect(() => {
                  const currentId = this.id();
                  if (this.isEditMode() && currentId) {
                    this.svc.${resource.operations.read!.methodName}({ ${
                  resource.operations.read!.idParamName
              }: currentId } as any).subscribe(data => this.form.patchValue(data as any));
                  }
                });
              }`
            : `readonly isEditMode = computed(() => false); constructor() {}`;
        const submitLogic = `
              onSubmit(): void {
                if (this.form.invalid) return;
                const formValue = this.form.getRawValue() as ${createModelName};
                const action$ = ${
                    canEdit
                        ? `this.isEditMode()
                  ? this.svc.${resource.operations.update!.methodName}({ ${
                              resource.operations.update!.idParamName
                          }: this.id(), body: formValue } as any)
                  :`
                        : ""
                } this.svc.${resource.operations.create!.methodName}({ body: formValue } as any);
                action$.subscribe(() => this.router.navigate(['admin/${resource.pluralName}']));
              }`;

        const materialImportsMap = {
            MatFormFieldModule: "@angular/material/form-field",
            MatInputModule: "@angular/material/input",
            MatButtonModule: "@angular/material/button",
            MatIconModule: "@angular/material/icon",
            MatCheckboxModule: "@angular/material/checkbox",
            MatSlideToggleModule: "@angular/material/slide-toggle",
            MatSelectModule: "@angular/material/select",
            MatRadioModule: "@angular/material/radio",
            MatSliderModule: "@angular/material/slider",
            MatChipsModule: "@angular/material/chips",
            MatButtonToggleModule: "@angular/material/button-toggle",
            MatDatepickerModule: "@angular/material/datepicker",
        };
        const materialImports = Array.from(materialModules)
            .map((mod) => `import { ${mod} } from '${materialImportsMap[mod as keyof typeof materialImportsMap]}';`)
            .join("\n");

        const specialImports: string[] = [];
        if (hasChipList) {
            specialImports.push(`import { startWith } from 'rxjs';`);
            specialImports.push(`import { MatChipInputEvent } from '@angular/material/chips';`);
        }
        if (hasDatepicker) {
            specialImports.push(`import { provideNativeDateAdapter } from '@angular/material/core';`);
        }

        const providerDecor =
            componentProviders.size > 0 ? `\n  providers: [${Array.from(componentProviders).join(", ")}],` : "";

        const angularCoreImports = new Set(["Component", "inject", "computed"]);
        if (canEdit) {
            angularCoreImports.add("input");
            angularCoreImports.add("effect");
        }

        tsFile.addStatements(`/* eslint-disable */
import { ${Array.from(angularCoreImports).join(", ")} } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
${specialImports.join("\n")}
${materialImports}
import { ${resource.serviceName} } from '../../../services';
import { ${createModelName} } from '../../../models';

@Component({
  selector: 'app-${resource.name}-form',
  standalone: true,
  imports: [ ${[...coreModules, ...materialModules].join(", ")} ],${providerDecor}
  templateUrl: './${compName}.html',
  styleUrls: ['./${compName}.css']
})
export class ${resource.className}FormComponent {
  private readonly router = inject(Router);
  private readonly svc = inject(${resource.serviceName});
  
  readonly form = new FormGroup({
    ${formControlFields}
  });

  ${editModeLogic}
  ${submitLogic}
  onCancel(): void { this.router.navigate(['admin/${resource.pluralName}']); }
  ${chipListMethods}
}`);

        tsFile.formatText();
        htmlFile.saveSync();
        cssFile.saveSync();
        tsFile.saveSync();
    }

    private generateModernRoutes(resource: Resource, dir: string) {
        const filePath = path.join(dir, `${resource.pluralName}.routes.ts`);
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });
        const routesName = `${resource.pluralName.toUpperCase()}_ROUTES`;
        const routeEntries = [];
        routeEntries.push(
            `{ path: '', title: '${plural(resource.titleName)}', loadComponent: () => import('./${
                resource.pluralName
            }-list/${resource.pluralName}-list.component').then(m => m.${resource.className}ListComponent) }`
        );
        if (resource.operations.create) {
            routeEntries.push(
                `{ path: 'new', title: 'Create ${resource.titleName}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`
            );
        }
        if (resource.operations.read && resource.operations.update) {
            const idParam = resource.operations.read.idParamName;
            routeEntries.push(
                `{ path: ':${idParam}/edit', title: 'Edit ${resource.titleName}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`
            );
        }
        sourceFile.addStatements(`/* eslint-disable */
import { Routes } from '@angular/router';
export const ${routesName}: Routes = [ ${routeEntries.join(",\n")} ];`);
        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
