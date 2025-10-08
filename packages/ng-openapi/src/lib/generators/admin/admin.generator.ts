import { GeneratorConfig, SwaggerParser, extractPaths, pascalCase, camelCase, PathInfo } from "@ng-openapi/shared";
import * as path from "path";
import * as fs from "fs";
import { Project } from "ts-morph";
import { FormProperty, Resource } from "./admin.types";
import { plural, titleCase } from "./admin.helpers";

function renderTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => context[key] !== undefined ? String(context[key]) : placeholder);
}

export class AdminGenerator {
    private readonly project: Project;
    private readonly parser: SwaggerParser;
    private readonly config: GeneratorConfig;

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        this.config = config; this.project = project; this.parser = parser;
    }

    private getTemplate(templateName: string): string {
        const testPath = path.join(__dirname, 'templates', templateName);
        if (fs.existsSync(testPath)) { return fs.readFileSync(testPath, 'utf8'); }
        const prodPath = path.join(__dirname, '..', 'templates', templateName);
        if (fs.existsSync(prodPath)) { return fs.readFileSync(prodPath, 'utf8'); }
        throw new Error(`CRITICAL: Template file "${templateName}" not found.`);
    }

    async generate(outputRoot: string): Promise<void> {
        console.log('[ADMIN] Starting admin component generation...');
        const resources = this.collectResources();
        if (resources.length === 0) {
            console.warn("[ADMIN] No viable resources found. A resource needs at least a List (GET) and Create (POST) endpoint on a collection path, identified by a common tag."); return;
        }
        for (const resource of resources) {
            console.log(`[ADMIN] Generating UI for resource: "${resource.name}"...`);
            const adminDir = path.join(outputRoot, 'admin', resource.pluralName);
            this.generateModernListComponent(resource, adminDir);
            this.generateModernFormComponent(resource, adminDir);
            this.generateModernRoutes(resource, adminDir);
        }
    }

    public collectResources(): Resource[] {
        const paths = extractPaths(this.parser.getSpec().paths);
        console.log(`[ADMIN] Analyzing ${paths.length} API paths by grouping them by tag...`);
        const tagGroups = new Map<string, PathInfo[]>();
        paths.forEach(p => { const t = p.tags?.[0]; if (t && !t.includes('_')) { if (!tagGroups.has(t)) tagGroups.set(t, []); tagGroups.get(t)!.push(p); } });

        const resources: Resource[] = [];
        for (const [tag, tagPaths] of tagGroups.entries()) {
            const isCollectionPath = (p: PathInfo) => !/\{[^}]+\}$/.test(p.path);
            const isItemPath = (p: PathInfo) => /\{[^}]+\}$/.test(p.path);
            const listOp = tagPaths.find(p => p.method === 'GET' && isCollectionPath(p));
            const createOp = tagPaths.find(p => p.method === 'POST' && isCollectionPath(p));
            if (!listOp || !createOp) { console.log(`[ADMIN] Skipping tag "${tag}": Missing required List (GET) or Create (POST) on a collection path.`); continue; }
            const readOp = tagPaths.find(p => p.method === 'GET' && isItemPath(p));

            // ===== FIX STARTS HERE: Correctly identify update operation =====
            // Removed the `|| createOp` fallback. An update operation must be explicit.
            const updateOp = tagPaths.find(p => (p.method === 'PUT' || p.method === 'PATCH') && isItemPath(p));
            // ===== FIX ENDS HERE =====

            const deleteOp = tagPaths.find(p => p.method === 'DELETE' && isItemPath(p));
            const schemaObject = createOp.requestBody?.content?.['application/json']?.schema;
            if (!schemaObject) continue;
            let finalSchema: any, modelName: string | undefined;
            if (schemaObject.$ref) {
                modelName = schemaObject.$ref.split('/').pop()?.replace(/^Create/, '');
                finalSchema = this.parser.resolveReference(schemaObject.$ref);
            } else { continue; }
            if (!finalSchema || !modelName) continue;
            const getIdParamName = (op: PathInfo | undefined) => op?.parameters?.find(p => p.in === 'path')?.name || 'id';

            const singularTag = tag.endsWith('s') && !tag.endsWith('ss') ? tag.slice(0, -1) : tag;

            const resource: Resource = {
                name: singularTag.toLowerCase(),
                className: pascalCase(singularTag),
                pluralName: plural(singularTag).toLowerCase(),
                titleName: titleCase(singularTag),
                serviceName: pascalCase(tag) + 'Service',
                modelName: pascalCase(modelName),
                operations: {
                    list: { methodName: this.getMethodName(listOp) },
                    create: { methodName: this.getMethodName(createOp) },
                    read: readOp ? { methodName: this.getMethodName(readOp), idParamName: getIdParamName(readOp) } : undefined,
                    update: updateOp && readOp ? { methodName: this.getMethodName(updateOp), idParamName: getIdParamName(readOp) } : undefined,
                    delete: deleteOp ? { methodName: this.getMethodName(deleteOp), idParamName: getIdParamName(deleteOp) } : undefined,
                },
                formProperties: this.processSchemaToFormProperties(finalSchema),
                listColumns: Object.keys(finalSchema.properties || {}),
            };
            resources.push(resource);
        }
        console.log(`[ADMIN] Identified ${resources.length} viable resources: ${resources.map(r => r.name).join(', ') || 'None'}.`);
        return resources;
    }

    private getMethodName(operation: any): string {
        if (operation.operationId) return camelCase(operation.operationId);
        return `${camelCase(operation.path.replace(/[\/{}]/g, ''))}${pascalCase(operation.method)}`;
    }

    private processSchemaToFormProperties(schema: any): FormProperty[] {
        const properties: FormProperty[] = [];
        if (!schema || !schema.properties) return properties;
        for (const propName in schema.properties) {
            const prop = schema.properties[propName];

            let type: FormProperty['type'] = 'string';
            let inputType: FormProperty['inputType'] = 'text';

            switch (prop.type) {
                case 'boolean':
                    type = 'boolean';
                    inputType = 'checkbox';
                    break;
                case 'number':
                case 'integer':
                    type = 'number';
                    inputType = 'number';
                    break;
                case 'string':
                    if (prop.format === 'date-time') {
                        inputType = 'datetime-local';
                    } else if (prop.format === 'date') {
                        inputType = 'date';
                    }
                    type = 'string';
                    break;
            }

            const isRequired = schema.required?.includes(propName) ?? false;
            const formProp: FormProperty = {
                name: propName,
                type: type,
                inputType: inputType,
                required: isRequired,
                validators: isRequired ? ['Validators.required'] : [],
                enumValues: prop.enum
            };

            properties.push(formProp);
        }
        return properties;
    }

    private generateModernListComponent(resource: Resource, dir: string) {
        const listDir = path.join(dir, `${resource.pluralName}-list`);
        const compName = `${resource.pluralName}-list.component`;
        const htmlFile = this.project.createSourceFile(path.join(listDir, `${compName}.html`), "", { overwrite: true });
        const cssFile = this.project.createSourceFile(path.join(listDir, `${compName}.css`), "", { overwrite: true });
        const tsFile = this.project.createSourceFile(path.join(listDir, `${compName}.ts`), "", { overwrite: true });

        const idKey = resource.operations.read?.idParamName || resource.operations.delete?.idParamName || 'name';
        const createBtn = resource.operations.create ? `<button mat-flat-button color="primary" [routerLink]="['new']"><mat-icon>add</mat-icon><span>Create ${resource.titleName}</span></button>` : '';
        const editBtn = resource.operations.update ? `<button mat-icon-button [routerLink]="[element.${idKey}, 'edit']" matTooltip="Edit ${resource.titleName}"><mat-icon>edit</mat-icon></button>` : '';
        const deleteBtn = resource.operations.delete ? `<button mat-icon-button color="warn" (click)="delete(element.${idKey})" matTooltip="Delete ${resource.titleName}"><mat-icon>delete</mat-icon></button>` : '';
        const columnsTemplate = resource.listColumns.map(col => `<ng-container matColumnDef="${col}"><th mat-header-cell *matHeaderCellDef>${titleCase(col)}</th><td mat-cell *matCellDef="let element">{{element.${col}}}</td></ng-container>`).join('\n');
        htmlFile.insertText(0, renderTemplate(this.getTemplate('list.component.html.template'), { ...resource, pluralTitleName: plural(resource.titleName), columnsTemplate, createButtonTemplate: createBtn, editButtonTemplate: editBtn, deleteButtonTemplate: deleteBtn }));
        cssFile.insertText(0, `:host { display: block; padding: 2rem; } .header-actions { display: flex; justify-content: flex-end; margin-bottom: 1rem; } .mat-elevation-z8 { width: 100%; } .actions-cell { width: 120px; text-align: right; }`);
        tsFile.addStatements(`/* eslint-disable */
import { Component, inject, signal, WritableSignal } from '@angular/core'; import { CommonModule } from '@angular/common'; import { RouterModule } from '@angular/router'; import { MatTableModule } from '@angular/material/table'; import { MatIconModule } from '@angular/material/icon'; import { MatButtonModule } from '@angular/material/button'; import { MatTooltipModule } from '@angular/material/tooltip'; import { ${resource.serviceName} } from '../../../services'; import { ${resource.modelName} } from '../../../models';
@Component({ selector: 'app-${resource.pluralName}-list', standalone: true, imports: [CommonModule, RouterModule, MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule], templateUrl: './${compName}.html', styleUrls: ['./${compName}.css'] })
export class ${resource.className}ListComponent {
  private readonly svc = inject(${resource.serviceName}); readonly data: WritableSignal<${resource.modelName}[]> = signal([]); readonly displayedColumns: string[] = ['${resource.listColumns.join("', '")}', 'actions'];
  constructor() { this.loadData(); }
  loadData() { this.svc.${resource.operations.list!.methodName}().subscribe((d: any) => this.data.set(d.${resource.pluralName} || d.profiles || d.repos || d)); }
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

        // ===== FIX STARTS HERE: Correctly generate form field HTML =====
        const fields = resource.formProperties.map(p => {
            const label = titleCase(p.name);
            switch (p.inputType) {
                case 'checkbox':
                    return `<mat-checkbox formControlName="${p.name}">${label}</mat-checkbox>`;
                default:
                    const requiredError = p.required ? `<mat-error>This field is required.</mat-error>` : '';
                    return `<mat-form-field appearance="outline">
  <mat-label>${label}</mat-label>
  <input matInput formControlName="${p.name}" type="${p.inputType}">
  ${requiredError}
</mat-form-field>`;
            }
        }).join('\n');

        // Use the template file instead of a hardcoded string
        htmlFile.insertText(0, renderTemplate(this.getTemplate('form.component.html.template'), {
            titleName: resource.titleName,
            formFieldsTemplate: fields
        }));
        // ===== FIX ENDS HERE =====

        cssFile.insertText(0, `:host { display: block; padding: 2rem; } .form-container { display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; } .action-buttons { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; } mat-checkbox { margin: 0.5rem 0; }`);

        const componentImports = `CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCheckboxModule`;
        const formGroupFields = resource.formProperties.map(p => `'${p.name}': [${p.type === 'boolean' ? false : 'null'} as any, [${p.validators.join(', ')}]]`).join(',\n');
        const canEdit = resource.operations.read && resource.operations.update;
        const editModeLogic = canEdit ? `
              readonly id = input<string | number>(); readonly isEditMode = computed(() => !!this.id());
              constructor() {
                effect(() => {
                  const currentId = this.id();
                  if (this.isEditMode() && currentId) {
                    this.svc.${resource.operations.read!.methodName}({ ${resource.operations.read!.idParamName}: currentId } as any).subscribe(data => this.form.patchValue(data as any));
                  }
                });
              }` : `readonly isEditMode = computed(() => false); constructor() {}`;
        const submitLogic = `
              onSubmit(): void {
                if (this.form.invalid) return;
                const action$ = ${canEdit ? `this.isEditMode()
                  ? this.svc.${resource.operations.update!.methodName}({ ${resource.operations.update!.idParamName}: this.id(), body: this.form.value } as any)
                  :` : ''} this.svc.${resource.operations.create!.methodName}({ body: this.form.value } as any);
                action$.subscribe(() => this.router.navigate(['admin/${resource.pluralName}']));
              }`;

        // ===== FIX STARTS HERE: Proper imports for TS file =====
        tsFile.addStatements(`/* eslint-disable */
import { Component, inject, input, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ${resource.serviceName} } from '../../../services';

@Component({
  selector: 'app-${resource.name}-form',
  standalone: true,
  imports: [ ${componentImports} ],
  templateUrl: './${compName}.html',
  styleUrls: ['./${compName}.css']
})
export class ${resource.className}FormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly svc = inject(${resource.serviceName});
  readonly form = this.fb.group({ ${formGroupFields} });
  ${editModeLogic}
  ${submitLogic}
  onCancel(): void { this.router.navigate(['admin/${resource.pluralName}']); }
}`);
        // ===== FIX ENDS HERE =====

        tsFile.formatText();
        htmlFile.saveSync(); cssFile.saveSync(); tsFile.saveSync();
    }

    private generateModernRoutes(resource: Resource, dir: string) {
        const filePath = path.join(dir, `${resource.pluralName}.routes.ts`);
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });
        const routesName = `${resource.pluralName.toUpperCase()}_ROUTES`;

        const routeEntries = [];
        routeEntries.push(`{ path: '', title: '${plural(resource.titleName)}', loadComponent: () => import('./${resource.pluralName}-list/${resource.pluralName}-list.component').then(m => m.${resource.className}ListComponent) }`);
        if(resource.operations.create) {
            routeEntries.push(`{ path: 'new', title: 'Create ${resource.titleName}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`);
        }
        if(resource.operations.read && resource.operations.update) {
            const idParam = resource.operations.read.idParamName;
            routeEntries.push(`{ path: ':${idParam}/edit', title: 'Edit ${resource.titleName}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`);
        }

        sourceFile.addStatements(`/* eslint-disable */
import { Routes } from '@angular/router';
export const ${routesName}: Routes = [ ${routeEntries.join(',\n')} ];`);

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
