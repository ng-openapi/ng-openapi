import { GeneratorConfig, SwaggerParser, extractPaths, pascalCase, camelCase } from "@ng-openapi/shared";
import * as path from "path";
import * as fs from "fs";
import { Project } from "ts-morph";
import { FormProperty, Resource } from "./admin.types";
import { plural, titleCase } from "./admin.helpers";

/**
 * A simple template rendering function.
 * Replaces {{key}} with the corresponding value from the context object.
 */
function renderTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => {
        return context[key] !== undefined ? String(context[key]) : placeholder;
    });
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

    async generate(outputRoot: string): Promise<void> {
        const resources = this.collectResources();
        if (resources.length === 0) {
            console.warn("No RESTful resources found to generate admin components.");
            return;
        }

        for (const resource of resources) {
            const adminDir = path.join(outputRoot, 'admin', resource.pluralName);

            // Generate files for each resource
            this.generateListComponent(resource, adminDir);
            this.generateFormComponent(resource, adminDir);
            this.generateRoutingModule(resource, adminDir);
            this.generateModule(resource, adminDir);
        }
    }

    public collectResources(): Resource[] {
        const paths = extractPaths(this.parser.getSpec().paths);
        const pathGroups = new Map<string, { collection?: string, item?: string }>();

        for (const pathInfo of paths) {
            const currentPath = pathInfo.path;
            const itemMatch = currentPath.match(/^(\/[^/]+)\/{[^}]+}$/); // Matches /resource/{id}
            if (itemMatch) {
                const basePath = itemMatch[1];
                const group = pathGroups.get(basePath) || {};
                group.item = currentPath;
                pathGroups.set(basePath, group);
            } else {
                const collectionMatch = currentPath.match(/^(\/[^/]+)\/?$/); // Matches /resource
                if (collectionMatch) {
                    const basePath = collectionMatch[1];
                    const group = pathGroups.get(basePath) || {};
                    group.collection = currentPath;
                    pathGroups.set(basePath, group);
                }
            }
        }

        const resources: Resource[] = [];
        for (const [basePath, group] of pathGroups.entries()) {
            if (!group.collection) continue;

            const pluralName = basePath.substring(1);
            // CORRECTED: Singularize the resource name
            const resourceName = pluralName.endsWith('ies') ? pluralName.slice(0, -3) + 'y' : (pluralName.endsWith('s') ? pluralName.slice(0, -1) : pluralName);

            const listOp = paths.find(p => p.path === group.collection && p.method === 'GET');
            const createOp = paths.find(p => p.path === group.collection && p.method === 'POST');

            if (!listOp || !createOp) continue;

            const schemaObject = createOp.requestBody?.content?.['application/json']?.schema;
            if (!schemaObject) continue;

            let finalSchema: any;
            let modelName: string | undefined;

            if (schemaObject.$ref) {
                modelName = schemaObject.$ref.split('/').pop();
                finalSchema = this.parser.resolveReference(schemaObject.$ref);
            } else {
                continue;
            }

            if (!finalSchema || !modelName || finalSchema.type !== 'object') continue;

            const readOp = paths.find(p => p.path === group.item && p.method === 'GET');
            const updateOp = paths.find(p => p.path === group.item && p.method === 'PUT');
            const deleteOp = paths.find(p => p.path === group.item && p.method === 'DELETE');

            if (!readOp || !updateOp) continue;

            const resource: Resource = {
                name: resourceName,
                className: pascalCase(resourceName),
                pluralName: pluralName,
                titleName: titleCase(resourceName),
                serviceName: pascalCase(createOp.tags?.[0] || pluralName) + 'Service',
                modelName: pascalCase(modelName),
                operations: {
                    list: { methodName: this.getMethodName(listOp) },
                    create: { methodName: this.getMethodName(createOp) },
                    read: { methodName: this.getMethodName(readOp), idParamName: readOp.parameters?.find(p => p.in === 'path')?.name },
                    update: { methodName: this.getMethodName(updateOp), idParamName: updateOp.parameters?.find(p => p.in === 'path')?.name },
                    delete: deleteOp ? { methodName: this.getMethodName(deleteOp), idParamName: deleteOp.parameters?.find(p => p.in === 'path')?.name } : undefined,
                },
                formProperties: this.processSchemaToFormProperties(finalSchema),
                listColumns: Object.keys(finalSchema.properties || {}).filter(p => !(finalSchema.properties?.[p])?.readOnly),
            };
            resources.push(resource);
        }
        return resources;
    }

    private getMethodName(operation: any): string {
        if (operation.operationId) {
            return camelCase(operation.operationId);
        }
        return `${camelCase(operation.path.replace(/[\/{}]/g, ''))}${pascalCase(operation.method)}`;
    }

    private processSchemaToFormProperties(schema: any): FormProperty[] {
        const properties: FormProperty[] = [];
        if (!schema.properties) return properties;

        for (const propName in schema.properties) {
            const prop = schema.properties[propName];
            if (prop.readOnly) continue;

            const formProp: FormProperty = {
                name: propName,
                type: 'string',
                inputType: 'text',
                required: schema.required?.includes(propName) ?? false,
                validators: [],
                enumValues: prop.enum
            };

            if (formProp.required) formProp.validators.push('Validators.required');
            if (prop.minLength) formProp.validators.push(`Validators.minLength(${prop.minLength})`);
            if (prop.maxLength) formProp.validators.push(`Validators.maxLength(${prop.maxLength})`);
            if (prop.pattern) formProp.validators.push(`Validators.pattern(/${prop.pattern}/)`);
            if (prop.minimum) formProp.validators.push(`Validators.min(${prop.minimum})`);
            if (prop.maximum) formProp.validators.push(`Validators.max(${prop.maximum})`);

            if (prop.enum) {
                formProp.type = 'enum';
            } else if (prop.type === 'boolean') {
                formProp.type = 'boolean';
                formProp.inputType = 'checkbox';
            } else if (prop.type === 'integer' || prop.type === 'number') {
                formProp.type = 'number';
                formProp.inputType = 'number';
            } else if (prop.type === 'string' && prop.format === 'date-time') {
                formProp.inputType = 'datetime-local';
            }
            properties.push(formProp);
        }
        return properties;
    }

    // --- Component Generation Logic ---

    private generateListComponent(resource: Resource, dir: string) {
        const listDir = path.join(dir, `${resource.pluralName}-list`);
        const componentFileName = `${resource.pluralName}-list.component`;
        const templatePath = path.join(__dirname, 'templates', 'list.component.html.template');

        const columnsTemplate = resource.listColumns.map(col => `
      <!-- ${titleCase(col)} Column -->
      <ng-container matColumnDef="${col}">
        <th mat-header-cell *matHeaderCellDef>${titleCase(col)}</th>
        <td mat-cell *matCellDef="let element">{{element.${col}}}</td>
      </ng-container>`).join('');
        const deleteButtonTemplate = resource.operations.delete
            ? `<button mat-icon-button color="warn" (click)="delete(element.id)" matTooltip="Delete ${resource.titleName}"><mat-icon>delete</mat-icon></button>`
            : '';

        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const htmlContent = renderTemplate(templateContent, {
            ...resource,
            pluralTitleName: plural(resource.titleName),
            columnsTemplate,
            deleteButtonTemplate
        });

        this.project.createSourceFile(path.join(listDir, `${componentFileName}.html`), htmlContent, { overwrite: true });

        const cssContent = `.container { padding: 2rem; } .header-actions { display: flex; justify-content: flex-end; margin-bottom: 1rem; } .full-width-table { width: 100%; } .no-data-message { padding: 2rem; text-align: center; color: grey; } .actions-cell { width: 120px; text-align: right; }`;
        this.project.createSourceFile(path.join(listDir, `${componentFileName}.css`), cssContent, { overwrite: true });

        const tsFilePath = path.join(listDir, `${componentFileName}.ts`);
        const sourceFile = this.project.createSourceFile(tsFilePath, undefined, { overwrite: true });

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'OnInit'] },
            { moduleSpecifier: 'rxjs', namedImports: ['Observable'] },
            { moduleSpecifier: `../../../models`, namedImports: [resource.modelName] },
            { moduleSpecifier: `../../../services`, namedImports: [resource.serviceName] },
        ]);

        const componentClass = sourceFile.addClass({
            name: `${resource.className}ListComponent`,
            isExported: true,
        });

        // CORRECTED: Don't chain after addImplements
        componentClass.addImplements('OnInit');

        componentClass.addDecorator({
            name: 'Component',
            arguments: [`{
                selector: 'app-${resource.pluralName}-list',
                templateUrl: './${componentFileName}.html',
                styleUrls: ['./${componentFileName}.css']
            }`],
        });

        componentClass.addProperty({ name: 'data$!', type: `Observable<${resource.modelName}[]>` });
        componentClass.addProperty({ name: 'displayedColumns', type: 'string[]', initializer: `[${resource.listColumns.map(c => `'${c}'`).join(', ')}, 'actions']` });
        componentClass.addConstructor({
            parameters: [{ name: camelCase(resource.serviceName), type: resource.serviceName, scope: 'private' }],
        });
        componentClass.addMethod({ name: 'ngOnInit', returnType: 'void', statements: 'this.loadData();' });
        componentClass.addMethod({ name: 'loadData', returnType: 'void', statements: `this.data$ = this.${camelCase(resource.serviceName)}.${resource.operations.list!.methodName}();` });

        if (resource.operations.delete) {
            componentClass.addMethod({
                name: 'delete', parameters: [{ name: 'id', type: 'number | string' }], returnType: 'void',
                statements: `if (confirm('Are you sure you want to delete this item?')) { this.${camelCase(resource.serviceName)}.${resource.operations.delete!.methodName}({ ${resource.operations.delete!.idParamName}: id }).subscribe(() => this.loadData()); }`
            });
        }
        sourceFile.formatText();
    }

    private generateFormComponent(resource: Resource, dir: string) {
        const formDir = path.join(dir, `${resource.name}-form`);
        const componentFileName = `${resource.name}-form.component`;
        const templatePath = path.join(__dirname, 'templates', 'form.component.html.template');

        const formFieldsTemplate = resource.formProperties.map(prop => {
            if (prop.type === 'enum') {
                return `\n    <mat-form-field appearance="outline">
      <mat-label>${titleCase(prop.name)}</mat-label>
      <mat-select formControlName="${prop.name}">
        ${prop.enumValues?.map(val => `<mat-option value="${val}">${val}</mat-option>`).join('\n        ')}
      </mat-select>
      <mat-error *ngIf="form.get('${prop.name}')?.hasError('required')">Required.</mat-error>
    </mat-form-field>`;
            }
            if (prop.type === 'boolean') {
                return `\n    <div class="checkbox-field">
      <mat-checkbox formControlName="${prop.name}">${titleCase(prop.name)}</mat-checkbox>
    </div>`;
            }
            return `\n    <mat-form-field appearance="outline">
      <mat-label>${titleCase(prop.name)}</mat-label>
      <input matInput type="${prop.inputType}" formControlName="${prop.name}">
      <mat-error *ngIf="form.get('${prop.name}')?.hasError('required')">Required.</mat-error>
    </mat-form-field>`;
        }).join('');

        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const htmlContent = renderTemplate(templateContent, {
            ...resource,
            formFieldsTemplate
        });
        this.project.createSourceFile(path.join(formDir, `${componentFileName}.html`), htmlContent, { overwrite: true });

        const cssContent = `.container { padding: 2rem; } .form-container { display: flex; flex-direction: column; gap: 0.5rem; max-width: 500px; } .action-buttons { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; } .checkbox-field { padding: 1rem 0; }`;
        this.project.createSourceFile(path.join(formDir, `${componentFileName}.css`), cssContent, { overwrite: true });

        const tsFilePath = path.join(formDir, `${componentFileName}.ts`);
        const sourceFile = this.project.createSourceFile(tsFilePath, undefined, { overwrite: true });

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Component', 'OnInit'] },
            { moduleSpecifier: '@angular/forms', namedImports: ['FormBuilder', 'FormGroup', 'Validators'] },
            { moduleSpecifier: '@angular/router', namedImports: ['ActivatedRoute', 'Router'] },
            { moduleSpecifier: `../../../models`, namedImports: [resource.modelName] },
            { moduleSpecifier: `../../../services`, namedImports: [resource.serviceName] },
        ]);

        const componentClass = sourceFile.addClass({
            name: `${resource.className}FormComponent`,
            isExported: true,
        });

        // CORRECTED: Don't chain after addImplements
        componentClass.addImplements('OnInit');

        componentClass.addDecorator({
            name: 'Component',
            arguments: [`{
                selector: 'app-${resource.name}-form',
                templateUrl: './${componentFileName}.html',
                styleUrls: ['./${componentFileName}.css']
            }`],
        });

        componentClass.addProperty({ name: 'form!', type: 'FormGroup' });
        componentClass.addProperty({ name: 'isEditMode', type: 'boolean', initializer: 'false' });
        componentClass.addProperty({ name: 'id: string | number | undefined' });

        componentClass.addConstructor({
            parameters: [
                { name: 'fb', type: 'FormBuilder', scope: 'private' },
                { name: 'route', type: 'ActivatedRoute', scope: 'private' },
                { name: 'router', type: 'Router', scope: 'private' },
                { name: camelCase(resource.serviceName), type: resource.serviceName, scope: 'private' },
            ]
        });

        const formGroupFields = resource.formProperties
            .map(p => `'${p.name}': [null, [${p.validators.join(', ')}]]`)
            .join(',\n          ');

        componentClass.addMethod({
            name: 'ngOnInit', returnType: 'void', statements: `
            this.id = this.route.snapshot.params['id'];
            this.isEditMode = !!this.id;
            this.form = this.fb.group({
              ${formGroupFields}
            });
            if (this.isEditMode) {
              this.${camelCase(resource.serviceName)}.${resource.operations.read!.methodName}({ ${resource.operations.read!.idParamName}: this.id }).subscribe(data => this.form.patchValue(data));
            }`
        });

        componentClass.addMethod({ name: 'onSubmit', returnType: 'void', statements: `
            if (this.form.invalid) return;
            const action$ = this.isEditMode
                ? this.${camelCase(resource.serviceName)}.${resource.operations.update!.methodName}({ ${resource.operations.update!.idParamName}: this.id!, body: this.form.value })
                : this.${camelCase(resource.serviceName)}.${resource.operations.create!.methodName}({ body: this.form.value });
            action$.subscribe(() => this.router.navigate(['/${resource.pluralName}']));
        ` });

        componentClass.addMethod({ name: 'onCancel', returnType: 'void', statements: `this.router.navigate(['/${resource.pluralName}']);` });
        sourceFile.formatText();
    }

    private generateRoutingModule(resource: Resource, dir: string) {
        const filePath = path.join(dir, `${resource.pluralName}-admin-routing.module.ts`);
        const sourceFile = this.project.createSourceFile(filePath, undefined, { overwrite: true });

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['NgModule'] },
            { moduleSpecifier: '@angular/router', namedImports: ['RouterModule', 'Routes'] },
            { moduleSpecifier: `./${resource.pluralName}-list/${resource.pluralName}-list.component`, namedImports: [`${resource.className}ListComponent`] },
            { moduleSpecifier: `./${resource.name}-form/${resource.name}-form.component`, namedImports: [`${resource.className}FormComponent`] },
        ]);

        sourceFile.addVariableStatement({
            isExported: false, declarationKind: 'const',
            declarations: [{ name: 'routes', type: 'Routes', initializer: `[
                { path: '', component: ${resource.className}ListComponent, title: '${plural(resource.titleName)}' },
                { path: 'new', component: ${resource.className}FormComponent, title: 'Create ${resource.titleName}' },
                { path: ':id/edit', component: ${resource.className}FormComponent, title: 'Edit ${resource.titleName}' }
            ]`}]
        });

        sourceFile.addClass({ name: `${resource.className}AdminRoutingModule`, isExported: true }).addDecorator({
            name: 'NgModule',
            arguments: [`{ imports: [RouterModule.forChild(routes)], exports: [RouterModule] }`],
        });

        sourceFile.formatText();
    }

    private generateModule(resource: Resource, dir: string) {
        const filePath = path.join(dir, `${resource.pluralName}-admin.module.ts`);
        const sourceFile = this.project.createSourceFile(filePath, undefined, { overwrite: true });

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['NgModule'] },
            { moduleSpecifier: '@angular/common', namedImports: ['CommonModule'] },
            { moduleSpecifier: '@angular/forms', namedImports: ['ReactiveFormsModule'] },
            { moduleSpecifier: `./${resource.pluralName}-admin-routing.module`, namedImports: [`${resource.className}AdminRoutingModule`] },
            { moduleSpecifier: `./${resource.pluralName}-list/${resource.pluralName}-list.component`, namedImports: [`${resource.className}ListComponent`] },
            { moduleSpecifier: `./${resource.name}-form/${resource.name}-form.component`, namedImports: [`${resource.className}FormComponent`] },
            // Material Modules
            { moduleSpecifier: '@angular/material/table', namedImports: ['MatTableModule'] },
            { moduleSpecifier: '@angular/material/icon', namedImports: ['MatIconModule'] },
            { moduleSpecifier: '@angular/material/button', namedImports: ['MatButtonModule'] },
            { moduleSpecifier: '@angular/material/tooltip', namedImports: ['MatTooltipModule'] },
            { moduleSpecifier: '@angular/material/form-field', namedImports: ['MatFormFieldModule'] },
            { moduleSpecifier: '@angular/material/input', namedImports: ['MatInputModule'] },
            { moduleSpecifier: '@angular/material/select', namedImports: ['MatSelectModule'] },
            { moduleSpecifier: '@angular/material/checkbox', namedImports: ['MatCheckboxModule'] },
        ]);

        sourceFile.addClass({ name: `${resource.className}AdminModule`, isExported: true }).addDecorator({
            name: 'NgModule',
            arguments: [`{
                declarations: [${resource.className}ListComponent, ${resource.className}FormComponent ],
                imports: [
                    CommonModule, ReactiveFormsModule, ${resource.className}AdminRoutingModule,
                    MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, MatFormFieldModule,
                    MatInputModule, MatSelectModule, MatCheckboxModule
                ]
            }`]
        });

        sourceFile.formatText();
    }
}
