import * as path from 'path';
import { Project, ClassDeclaration, SourceFile } from "ts-morph";
import { Resource, ResourceOperation, ResourceAction } from '../admin.types';
import { pascalCase, titleCase, camelCase } from "@ng-openapi/shared";
import { generateFormControlsTS, generateFormFieldsHTML } from '../helpers/generation.helpers';
import { getTemplate } from '../helpers/template.reader';

const MATERIAL_MODULE_MAP: Record<string, string> = {
    MatButtonModule: '@angular/material/button',
    MatButtonToggleModule: '@angular/material/button-toggle',
    MatCheckboxModule: '@angular/material/checkbox',
    MatChipsModule: '@angular/material/chips',
    MatDatepickerModule: '@angular/material/datepicker',
    MatFormFieldModule: '@angular/material/form-field',
    MatIconModule: '@angular/material/icon',
    MatInputModule: '@angular/material/input',
    MatMenuModule: '@angular/material/menu',
    MatRadioModule: '@angular/material/radio',
    MatSelectModule: '@angular/material/select',
    MatSliderModule: '@angular/material/slider',
};

function addCoreImports(sourceFile: SourceFile, resource: Resource) {
    sourceFile.addImportDeclarations([
        { moduleSpecifier: '@angular/common', namedImports: ['CommonModule'] },
        { moduleSpecifier: '@angular/core', namedImports: ['Component', 'inject', 'signal', 'input', 'computed', 'effect'] },
        { moduleSpecifier: '@angular/forms', namedImports: ['FormGroup', 'FormControl', 'FormArray', 'Validators', 'ReactiveFormsModule'] },
        { moduleSpecifier: '@angular/router', namedImports: ['Router', 'ActivatedRoute'] },
    ]);

    if (resource.isEditable || resource.actions.some(a => a.level === 'item')) {
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/material/snack-bar', namedImports: ['MatSnackBar'] });
    }
}

function addManualServiceImports(sourceFile: SourceFile, resource: Resource, allResources: Resource[]) {
    const componentDir = path.dirname(sourceFile.getFilePath());
    const servicesDir = path.resolve(componentDir, '../../../services');
    const relativeServicesPath = `./${path.relative(componentDir, servicesDir).replace(/\\/g, '/')}`;

    const imports = new Set<string>([resource.serviceName]);
    resource.formProperties
        .filter(p => p.type === 'relationship')
        .forEach(p => {
            const relatedResource = allResources.find(r => r.name === p.relationResourceName);
            if (relatedResource && relatedResource.serviceName) {
                imports.add(relatedResource.serviceName);
            }
        });

    sourceFile.addImportDeclaration({
        namedImports: Array.from(imports),
        moduleSpecifier: relativeServicesPath,
    });
}

function buildCrudServiceCallArgs(operation: ResourceOperation, context: { idVarName?: string, bodyVarName?: string }): string {
    const idArg = context.idVarName ? `${context.idVarName} as ${operation.idParamType}` : '';
    // Check for Swagger 2.0 body parameter OR OpenAPI 3.0 requestBody
    const hasBody = (operation.parameters ?? []).some((p: any) => p.in === 'body') || operation.methodName.toLowerCase().includes('post') || operation.methodName.toLowerCase().includes('put');
    const bodyArg = (hasBody && context.bodyVarName) ? (idArg ? `, ${context.bodyVarName}` : context.bodyVarName) : '';

    return `${idArg}${bodyArg}`;
}

function buildActionServiceCall(action: ResourceAction, idVarName: string): string {
    const args = (action.parameters ?? []).map(p => {
        if (p.in === 'path') {
            return `${idVarName} as ${action.idParamType}`;
        }
        if (p.in === 'body' || (p as any).in === 'formData') {
            return 'undefined';
        }
        return 'undefined';
    }).join(', ');
    return `this.svc.${action.methodName}(${args || ''})`;
}

export function writeFormComponent(resource: Resource, project: Project, allResources: Resource[], adminDir: string, usesCustomValidators: boolean) {
    if (!resource.createModelName && !resource.operations.read) return;

    const dir = path.join(adminDir, resource.pluralName, `${resource.name}-form`);
    const compName = `${resource.name}-form.component`;
    const sourceFile = project.createSourceFile(path.join(dir, `${compName}.ts`), "", { overwrite: true });

    const formProperties = resource.formProperties ?? [];
    const itemActions = resource.actions.filter(a => a.level === 'item');

    // --- HTML & CSS Generation ---
    let htmlContent: string;
    if (resource.isEditable) {
        const htmlFormFields = generateFormFieldsHTML(formProperties, false);
        const htmlReadOnlyFields = generateFormFieldsHTML(formProperties, true);
        htmlContent = getTemplate('form.component.html.template')
            .replace(/{{TitleCaseName}}/g, resource.titleName)
            .replace(/{{formFieldsEditableTemplate}}/g, htmlFormFields)
            .replace(/{{formFieldsReadOnlyTemplate}}/g, htmlReadOnlyFields)
            .replace(/{{itemActionButtons}}/g, itemActions.map(a => `<button mat-stroked-button type="button" (click)="onAction('${a.methodName}')">${titleCase(a.label)}</button>`).join('\n'));
    } else {
        const htmlReadOnlyFields = generateFormFieldsHTML(formProperties, true);
        const itemActionButtons = itemActions.map(a => `<button mat-stroked-button type="button" (click)="onAction('${a.methodName}')">${titleCase(a.label)}</button>`).join('\n');
        htmlContent = `
<div class="container">
    <h1>View ${resource.titleName}</h1>
    ${htmlReadOnlyFields}
    <div class="action-buttons">
        <div class="item-actions">
            ${itemActionButtons}
        </div>
        <button mat-stroked-button type="button" (click)="onCancel()">Back to List</button>
    </div>
</div>`.trim();
    }

    project.createSourceFile(path.join(dir, `${compName}.html`), htmlContent, { overwrite: true }).saveSync();
    project.createSourceFile(path.join(dir, `${compName}.css`), "/* Add component styles here */", { overwrite: true }).saveSync();

    // --- TypeScript Generation (Fully Programmatic) ---
    addCoreImports(sourceFile, resource);
    addManualServiceImports(sourceFile, resource, allResources);
    sourceFile.addStatements((resource.inlineInterfaces ?? []).map(i => i.definition));

    const classDeclaration = sourceFile.addClass({
        name: `${pascalCase(resource.name)}FormComponent`,
        isExported: true,
    });

    addBaseProperties(classDeclaration, resource, itemActions.length > 0);
    addFormProperties(classDeclaration, resource);
    addEffect(classDeclaration, resource);
    addConstructor(classDeclaration, resource);
    addMethods(classDeclaration, resource, itemActions);
    addFormArrayHelperMethods(classDeclaration, resource);
    addDecoratorAndImports(sourceFile, classDeclaration, resource, compName);

    sourceFile.fixMissingImports({}, { importModuleSpecifierPreference: 'relative' });
    sourceFile.formatText({ indentSize: 2 });
    sourceFile.saveSync();
}

function addBaseProperties(classDeclaration: ClassDeclaration, resource: Resource, hasItemActions: boolean): void {
    classDeclaration.addProperties([
        { name: 'router', scope: 'private', isReadonly: true, initializer: writer => writer.write('inject(Router)') },
        { name: 'route', scope: 'private', isReadonly: true, initializer: writer => writer.write('inject(ActivatedRoute)') },
        { name: 'svc', type: resource.serviceName, scope: 'private', isReadonly: true, initializer: writer => writer.write(`inject(${resource.serviceName})`) },
    ]);
    if (resource.isEditable || hasItemActions) {
        classDeclaration.addProperty({ name: 'snackBar', scope: 'private', isReadonly: true, initializer: writer => writer.write('inject(MatSnackBar)') });
    }
    resource.formProperties.filter(p => p.type === 'relationship').forEach(p => {
        classDeclaration.addProperty({ name: `${camelCase(p.relationResourceName!)}Options$`, initializer: writer => writer.write(`this.${camelCase(p.relationResourceName! + 'Svc')}.${p.relationListMethodName}()`) });
        classDeclaration.addProperty({ name: `${camelCase(p.relationResourceName! + 'Svc')}`, type: p.relationServiceName, scope: 'private', isReadonly: true, initializer: writer => writer.write(`inject(${p.relationServiceName})`) });
    });
    classDeclaration.addProperties([
        { name: 'data', isReadonly: true, initializer: writer => writer.write(`signal<${resource.modelName || 'any'} | null>(null)`) },
        { name: 'isEditable', isReadonly: true, initializer: writer => writer.write(String(resource.isEditable)) },
        { name: 'id', isReadonly: true, initializer: writer => writer.write('input<string | number>()') },
        { name: 'isEditMode', isReadonly: true, initializer: writer => writer.write('computed(() => this.isEditable && !!this.id())') },
        { name: 'isViewMode', isReadonly: true, initializer: writer => writer.write('computed(() => !this.isEditable && !!this.id())') },
        { name: 'isNewMode', isReadonly: true, initializer: writer => writer.write('computed(() => !this.id())') },
    ]);
}

function addFormProperties(classDeclaration: ClassDeclaration, resource: Resource): void {
    const modelForForm = resource.createModelName || resource.modelName;
    if (resource.isEditable) {
        const formControls = generateFormControlsTS(resource.formProperties, modelForForm);
        classDeclaration.addProperty({
            name: 'form',
            isReadonly: true,
            initializer: writer => {
                writer.write("new FormGroup({").newLine().indent(() => {
                    formControls.forEach((prop, i) => {
                        writer.write(`${prop.name}: ${prop.initializer}`);
                        if (i < formControls.length - 1) writer.write(',');
                        writer.newLine();
                    });
                }).write("})");
            }
        });
        if (resource.formProperties.some(p => p.type === 'relationship')) {
            classDeclaration.addProperty({ name: 'compareById', initializer: writer => writer.write(`(o1: { id: unknown }, o2: { id: unknown }): boolean => o1?.id === o2?.id`) });
        }
    } else {
        classDeclaration.addProperty({ name: 'form', isReadonly: true, initializer: writer => writer.write('null as any') });
    }
}

function addEffect(classDeclaration: ClassDeclaration, resource: Resource): void {
    if (resource.operations.read) {
        const readOp = resource.operations.read;
        const patchLogic = resource.formProperties.filter(p => p.type === 'array_object').map(p =>
            `if (data.${p.name} && Array.isArray(data.${p.name})) { this.${p.name}.clear(); data.${p.name}.forEach(item => { const fg = this.create${pascalCase(p.name).replace(/s$/, '')}(); fg.patchValue(item as any); this.${p.name}.push(fg); }); }`
        ).join(' ');
        const effectBody = `const id = this.id(); const data = this.data(); if (id && !data) { this.svc.${readOp.methodName}(id as ${readOp.idParamType}).subscribe(d => this.data.set(d)); } else if (data && this.form) { this.form.patchValue(data as any); ${patchLogic} } else if (!id && this.form) { this.form.reset(); } if (this.isViewMode() && this.form) { this.form.disable(); }`;
        classDeclaration.addProperty({ name: 'formEffect', scope: 'private', isReadonly: true, initializer: writer => writer.write(`effect(() => { ${effectBody} })`) });
    }
}

function addConstructor(classDeclaration: ClassDeclaration, resource: Resource): void {
    const polymorphicProps = resource.formProperties.filter(p => p.type === 'polymorphic');
    if (resource.isEditable && polymorphicProps.length > 0) {
        const subscriptions = polymorphicProps.map(p =>
            `this.form.get('${p.name}.typeSelector')!.valueChanges.subscribe(type => { ${p.polymorphicOptions!.map(opt => `const ${opt.name.toLowerCase()}Form = this.form.get('${p.name}.${opt.name}')!; if (type === '${opt.name}') { ${opt.name.toLowerCase()}Form.enable(); } else { ${opt.name.toLowerCase()}Form.disable(); ${opt.name.toLowerCase()}Form.reset(); }`).join(' ')
            } });`
        ).join(' ');
        classDeclaration.addConstructor({ statements: writer => writer.write(subscriptions) });
    }
}

function addMethods(classDeclaration: ClassDeclaration, resource: Resource, itemActions: ResourceAction[]): void {
    if (resource.isEditable) {
        const modelForForm = resource.createModelName || resource.modelName;
        const updateOp = resource.operations.update;
        const createOp = resource.operations.create;
        const updateCall = updateOp ? `this.svc.${updateOp.methodName}(${buildCrudServiceCallArgs(updateOp, { idVarName: 'this.id()', bodyVarName: 'formValue' })})` : 'null';
        const createCall = createOp ? `this.svc.${createOp.methodName}(${buildCrudServiceCallArgs(createOp, { bodyVarName: 'formValue' })})` : 'null';

        const body = `if (this.form.invalid) { this.snackBar.open('Please correct the errors.', 'Dismiss', { duration: 3000 }); return; } const formValue = this.form.getRawValue() as ${modelForForm}; const action$ = this.isEditMode() ? ${updateCall} : ${createCall}; action$?.subscribe({ next: () => { this.snackBar.open('${resource.titleName} saved.', 'OK', { duration: 3000 }); this.router.navigate(['..'], { relativeTo: this.route }); }, error: (err) => { this.snackBar.open('Save failed.', 'OK', { duration: 5000 }); console.error(err); } });`;
        classDeclaration.addMethod({ name: 'onSubmit', statements: writer => writer.write(body) });
    }
    classDeclaration.addMethod({ name: 'onCancel', statements: writer => writer.write(`this.router.navigate(['..'], { relativeTo: this.route });`) });
    if (itemActions.length > 0) {
        const cases = itemActions.map(a => `case '${a.methodName}': ${buildActionServiceCall(a, 'id')}.subscribe(() => this.snackBar.open('${titleCase(a.label)} completed.', 'OK', { duration: 3000 })); break;`).join('\n');
        classDeclaration.addMethod({ name: 'onAction', parameters: [{ name: 'actionName', type: 'string' }], statements: writer => writer.write(`const id = this.id(); if (!id) return; switch(actionName) { ${cases} }`) });
    }
}

function addFormArrayHelperMethods(classDeclaration: ClassDeclaration, resource: Resource) {
    resource.formProperties.filter(p => p.type === 'array_object').forEach(p => {
        const singular = pascalCase(p.name).replace(/s$/, '');
        const formControls = generateFormControlsTS(p.nestedProperties!, p.arrayItemModelName!);
        classDeclaration.addGetAccessor({ name: p.name, returnType: 'FormArray', statements: writer => writer.write(`return this.form.get('${p.name}') as FormArray;`) });
        classDeclaration.addMethod({
            name: `create${singular}`, returnType: 'FormGroup',
            statements: writer => {
                writer.write("return new FormGroup({").newLine().indent(() => {
                    formControls.forEach((prop, i) => {
                        writer.write(`${prop.name}: ${prop.initializer}`);
                        if (i < formControls.length - 1) writer.write(',');
                        writer.newLine();
                    });
                }).write("});");
            }
        });
        classDeclaration.addMethod({ name: `add${singular}`, statements: writer => writer.write(`this.${p.name}.push(this.create${singular}());`) });
        classDeclaration.addMethod({ name: `remove${singular}`, parameters: [{ name: 'index', type: 'number' }], statements: writer => writer.write(`this.${p.name}.removeAt(index);`) });
    });
    if (resource.formProperties.some(p => p.type === 'file')) {
        classDeclaration.addMethod({ name: 'onFileSelected', parameters: [{ name: 'event', type: 'Event' }, { name: 'controlName', type: 'string' }], statements: writer => writer.write(`const file = (event.target as HTMLInputElement).files?.[0]; if (file) { this.form.get(controlName)!.setValue(file); }`) });
    }
}

function addDecoratorAndImports(sourceFile: SourceFile, classDeclaration: ClassDeclaration, resource: Resource, compName: string): void {
    const imports = new Set<string>(['CommonModule', 'MatButtonModule', 'MatIconModule']);
    if (resource.isEditable) {
        imports.add('ReactiveFormsModule');
        resource.formProperties.forEach(p => {
            if (p.inputType === 'select' || p.type === 'relationship') imports.add('MatSelectModule');
            if (p.inputType === 'datepicker') imports.add('MatDatepickerModule');
            if (p.inputType === 'radio-group') imports.add('MatRadioModule');
            if (p.inputType === 'checkbox' || p.inputType === 'slide-toggle') imports.add('MatCheckboxModule');
            if (p.inputType === 'slider') imports.add('MatSliderModule');
            if (p.inputType === 'button-toggle-group') imports.add('MatButtonToggleModule');
            if (p.inputType === 'chip-list') { imports.add('MatChipsModule'); imports.add('MatFormFieldModule'); }
            if (['text', 'number', 'textarea', 'select', 'datepicker'].includes(p.inputType) || p.type === 'relationship') {
                imports.add('MatFormFieldModule');
                imports.add('MatInputModule');
            }
        });
    }

    // Add explicit top-level imports for the material modules
    for (const moduleName of Array.from(imports)) {
        if (MATERIAL_MODULE_MAP[moduleName]) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: MATERIAL_MODULE_MAP[moduleName],
                namedImports: [moduleName]
            });
        }
    }

    classDeclaration.addDecorator({
        name: 'Component',
        arguments: [writer => {
            writer.write("{").newLine().indent(() => {
                writer.writeLine(`selector: 'app-${resource.name}-form',`);
                writer.writeLine(`standalone: true,`);
                writer.writeLine(`imports: [${Array.from(imports).join(', ')}],`);
                writer.writeLine(`templateUrl: './${compName}.html',`);
                writer.writeLine(`styleUrls: ['./${compName}.css']`);
            }).write("}");
        }]
    });
}
