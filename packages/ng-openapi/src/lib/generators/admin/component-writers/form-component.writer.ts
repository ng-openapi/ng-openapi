import * as path from 'path';
import { Project } from 'ts-morph';
import { Resource, ResourceOperation, SwaggerParameter, ResourceAction } from '../admin.types';
import { pascalCase, titleCase, camelCase } from "@ng-openapi/shared";
import { generateFormControlsTS, generateFormFieldsHTML } from '../helpers/generation.helpers';
import { getTemplate } from '../helpers/template.reader';

function buildCrudServiceCallArgs(operation: ResourceOperation, context: { idVarName?: string, bodyVarName?: string }): string {
    const idArg = context.idVarName ? `${context.idVarName} as ${operation.idParamType}` : '';
    let bodyArg = '';

    // Check if there is a body parameter
    const hasBody = (operation.parameters ?? []).some(p => (p as any).in === 'body');
    if (hasBody && context.bodyVarName) {
        bodyArg = `, ${context.bodyVarName}`;
    }

    if (operation.methodName.startsWith('create')) return context.bodyVarName || '';

    // For update, the order is typically id, then body.
    if (operation.methodName.startsWith('update')) {
        return `${idArg}${bodyArg}`;
    }

    // For read, it's just the id.
    return idArg;
}

function buildActionServiceCall(action: ResourceAction, idVarName: string): string {
    const args = (action.parameters ?? []).map(p => {
        if (p.in === 'path') {
            const castType = action.idParamType !== 'string' ? ` as ${action.idParamType}` : '';
            return `${idVarName}${castType}`;
        }
        // For other parameters (formData, query, etc.), we don't have form controls for them yet,
        // so we pass undefined to allow optional params to work.
        return 'undefined';
    }).join(', ');

    return `this.svc.${action.methodName}(${args})`;
}

const MAT_MODULE_MAP = {
    'text': { module: 'MatFormFieldModule', path: '@angular/material/form-field' },
    'number': { module: 'MatFormFieldModule', path: '@angular/material/form-field' },
    'password': { module: 'MatFormFieldModule', path: '@angular/material/form-field' },
    'email': { module: 'MatFormFieldModule', path: '@angular/material/form-field' },
    'textarea': { module: 'MatFormFieldModule', path: '@angular/material/form-field' },
    'checkbox': { module: 'MatCheckboxModule', path: '@angular/material/checkbox' },
    'slide-toggle': { module: 'MatSlideToggleModule', path: '@angular/material/slide-toggle' },
    'select': { module: 'MatSelectModule', path: '@angular/material/select' },
    'radio-group': { module: 'MatRadioModule', path: '@angular/material/radio' },
    'slider': { module: 'MatSliderModule', path: '@angular/material/slider' },
    'chip-list': { module: 'MatChipsModule', path: '@angular/material/chips' },
    'button-toggle-group': { module: 'MatButtonToggleModule', path: '@angular/material/button-toggle' },
    'datepicker': { module: 'MatDatepickerModule', path: '@angular/material/datepicker' },
    'relationship': { module: 'MatSelectModule', path: '@angular/material/select' }
};

export function writeFormComponent(resource: Resource, project: Project, allResources: Resource[], adminDir: string, usesCustomValidators: boolean) {
    if (!resource.createModelName && !resource.operations.read) return;

    const dir = path.join(adminDir, resource.pluralName, `${resource.name}-form`);
    const compName = `${resource.name}-form.component`;
    const sourceFile = project.createSourceFile(path.join(dir, `${compName}.ts`), "", { overwrite: true });

    const isEditable = resource.isEditable;
    const formProperties = resource.formProperties ?? [];
    const modelForForm = resource.createModelName || resource.modelName;
    const modelClassName = resource.modelName || 'any';

    // 1. Generate HTML
    const itemActions = resource.actions.filter(a => a.level === 'item');
    const itemActionButtons = itemActions.map(a => `<button mat-stroked-button type="button" (click)="onAction('${a.methodName}')">${titleCase(a.label)}</button>`).join('\n');
    const htmlFormFields = generateFormFieldsHTML(formProperties, !isEditable);
    const htmlContent = getTemplate('form.component.html.template')
        .replace(/{{TitleCaseName}}/g, resource.titleName)
        .replace(/{{formFieldsTemplate}}/g, htmlFormFields)
        .replace(/{{isEditable}}/g, String(isEditable))
        .replace(/{{itemActionButtons}}/g, itemActionButtons);
    project.createSourceFile(path.join(dir, `${compName}.html`), htmlContent, { overwrite: true }).saveSync();
    project.createSourceFile(path.join(dir, `${compName}.css`), "/* Add component styles here */", { overwrite: true }).saveSync();

    // 2. Assemble all string pieces for the TS Template
    const angularCoreImports = new Set(['Component', 'inject', 'computed', 'signal', 'input']);
    if (resource.operations.read) angularCoreImports.add('effect');

    // --- Imports ---
    const needsStartWith = isEditable && (formProperties.some(p => p.inputType === 'chip-list') || formProperties.some(p => p.type === 'relationship'));
    const formArrayChipProps = formProperties.filter(p => p.inputType === 'chip-list');

    const requiredMatModules = new Map<string, string>();
    formProperties.forEach(p => {
        const inputType = p.type === 'relationship' ? 'relationship' : p.inputType;
        if (inputType && MAT_MODULE_MAP[inputType]) {
            const { module, path } = MAT_MODULE_MAP[inputType];
            if (!requiredMatModules.has(module)) {
                requiredMatModules.set(module, path);
            }
        }
    });

    if (isEditable) {
        requiredMatModules.set('MatInputModule', '@angular/material/input');
    }
    requiredMatModules.set('MatButtonModule', '@angular/material/button');
    requiredMatModules.set('MatIconModule', '@angular/material/icon');
    const matImportStatements = Array.from(requiredMatModules.entries()).map(([module, path]) => `import { ${module} } from '${path}';`).join('\n');
    const matModulesForComponentArray = Array.from(requiredMatModules.keys());

    const relationshipProps = formProperties.filter(p => p.type === 'relationship');
    const formArrayObjectProps = formProperties.filter(p => p.type === 'array_object');

    const serviceImports = [...new Set([resource.serviceName, ...relationshipProps.map(p => p.relationServiceName!)])].filter(Boolean);
    const modelImports = [...new Set([modelClassName, modelForForm, ...relationshipProps.map(p => p.relationModelName!), ...formArrayObjectProps.map(p => p.arrayItemModelName!)])].filter(Boolean);

    // --- Inline Interfaces ---
    const inlineInterfaces = (resource.inlineInterfaces ?? []).map(i => i.definition).join('\n\n');

    // --- Class Body ---
    const relationServiceInjections = relationshipProps.map(p => `private readonly ${camelCase(p.relationResourceName! + 'Svc')} = inject(${p.relationServiceName});`).join('\n    ');
    const formControlFields = generateFormControlsTS(formProperties, modelForForm);
    const formDeclaration = isEditable ? `readonly form = new FormGroup({
    ${formControlFields}
    });` : 'readonly form = null as any;';

    const compareById = `compareById = (o1: { id: unknown }, o2: { id: unknown }): boolean => o1?.id === o2?.id;`;

    const helperMethods: string[] = [];
    if (itemActions.length > 0) {
        const actionCases = itemActions.map(a => {
            const serviceCall = buildActionServiceCall(a, 'id');
            return `case '${a.methodName}':
                ${serviceCall}.subscribe(() => this.snackBar.open('${titleCase(a.label)} completed.', 'Dismiss', { duration: 3000 }));
                break;`;
        }).join('\n            ');

        helperMethods.push(`onAction(actionName: string): void {
        const id = this.id(); if (!id) return;
        switch(actionName) {
            ${actionCases}
        }
    }`);
    }

    helperMethods.push(...formArrayChipProps.map(p => `
    readonly ${p.name}Signal = (this.form.get('${p.name}') as FormArray<FormControl<string>>).valueChanges.pipe(startWith((this.form.get('${p.name}') as FormArray<FormControl<string>>).value));
    add${pascalCase(p.name)}(event: MatChipInputEvent): void { const value = (event.value || '').trim(); if (value) { const current = (this.form.get('${p.name}') as FormArray).value; (this.form.get('${p.name}') as FormArray).setValue([...new Set([...(current || []), value])]); } event.chipInput!.clear(); }
    remove${pascalCase(p.name)}(item: string): void { const current = (this.form.get('${p.name}') as FormArray).value; (this.form.get('${p.name}') as FormArray).setValue(current.filter((i: string) => i !== item)); }`));

    helperMethods.push(...formArrayObjectProps.map(p => {
        const singularTitle = pascalCase(p.name).replace(/s$/, '');
        const itemType = p.arrayItemModelName!;
        return `get ${p.name}(): FormArray { return this.form.get('${p.name}') as FormArray; }
create${singularTitle}(): FormGroup { return new FormGroup({ ${generateFormControlsTS(p.nestedProperties!, itemType)} }); }
add${singularTitle}(): void { this.${p.name}.push(this.create${singularTitle}()); }
remove${singularTitle}(index: number): void { this.${p.name}.removeAt(index); }`;
    }));

    if (formProperties.some(p => p.type === 'file')) {
        helperMethods.push(`onFileSelected(event: Event, controlName: string): void { const file = (event.target as HTMLInputElement).files?.[0]; if (file) { this.form.get(controlName)!.setValue(file); } }`);
    }

    // --- Logic Blocks ---
    let effectBlock = '';
    if (resource.operations.read) {
        const readOp = resource.operations.read;
        const readArgs = buildCrudServiceCallArgs(readOp, { idVarName: 'id' });

        const formArrayPatchLogic = formArrayObjectProps.map(p => {
            const itemType = p.arrayItemModelName!;
            return `if (data.${p.name} && Array.isArray(data.${p.name})) {
            this.${p.name}.clear();
            data.${p.name}.forEach((item: ${itemType}) => {
                const formGroup = this.create${pascalCase(p.name).replace(/s$/, '')}();
                formGroup.patchValue(item);
                this.${p.name}.push(formGroup);
            });
        }`;}).join('\n');
        effectBlock = `private readonly formEffect = effect(() => {
        const id = this.id();
        const data = this.data();
        if (id && !data) { this.svc.${readOp.methodName}(${readArgs}).subscribe(data => this.data.set(data)); }
        else if (data) { this.form.patchValue(data); ${formArrayPatchLogic} }
        else if (!id) { this.form.reset(); }
        if (this.isViewMode()) { this.form.disable(); }
    });`;
    }

    let constructorBlock = 'constructor() {}';
    const polymorphicProps = formProperties.filter(p => p.type === 'polymorphic');
    if (isEditable && polymorphicProps.length > 0) {
        const subscriptions = polymorphicProps.map(p => {
            const optionsLogic = p.polymorphicOptions!.map(opt => `const ${opt.name.toLowerCase()}Form = this.form.get('${p.name}.${opt.name}')!;
            if (type === '${opt.name}') { ${opt.name.toLowerCase()}Form.enable(); } else { ${opt.name.toLowerCase()}Form.disable(); ${opt.name.toLowerCase()}Form.reset(); }`).join('\n');
            return `this.form.get('${p.name}.typeSelector')!.valueChanges.subscribe(type => { ${optionsLogic} });`
        }).join('');
        constructorBlock = `constructor() { ${subscriptions} }`;
    }

    let onSubmitBlock = '';
    if (isEditable) {
        const updateOp = resource.operations.update;
        const createOp = resource.operations.create;
        const updateArgs = updateOp ? buildCrudServiceCallArgs(updateOp, { idVarName: 'this.id()', bodyVarName: 'formValue' }) : '';
        const createArgs = createOp ? buildCrudServiceCallArgs(createOp, { bodyVarName: 'formValue' }) : '';

        const updateCall = updateOp ? `this.svc.${updateOp.methodName}(${updateArgs})` : 'null';
        const createCall = createOp ? `this.svc.${createOp.methodName}(${createArgs})` : 'null';
        onSubmitBlock = `onSubmit(): void {
        this.form.markAllAsTouched(); if (this.form.invalid) { this.snackBar.open('Please correct the errors on the form.', 'Dismiss', { duration: 3000 }); return; }
        const formValue = this.form.getRawValue() as ${modelForForm};
        const action$ = this.isEditMode() ? ${updateCall} : ${createCall};
        action$?.subscribe({
            next: () => { this.snackBar.open('${resource.titleName} saved successfully.', 'Dismiss', { duration: 3000 }); this.router.navigate(['..'], { relativeTo: this.route }); },
            error: (err) => { console.error('Error saving ${resource.name}:', err); this.snackBar.open('Error: ${resource.name} could not be saved.', 'Dismiss', { duration: 5000 }); }
        });
    }`;
    }

    // 3. Populate and write the template
    const template = getTemplate('form.component.ts.template');
    const finalContent = template
        .replace('{{angularCoreImports}}', Array.from(angularCoreImports).join(', '))
        .replace('{{rxjsImports}}', needsStartWith ? `import { startWith } from 'rxjs/operators';` : '')
        .replace('{{reactiveFormsImports}}', '') // This will be handled by fixMissingImports
        .replace('{{matChipInputEventImport}}', formArrayChipProps.length > 0 ? `import { MatChipInputEvent } from '@angular/material/chips';` : '')
        .replace('{{customValidatorsImport}}', usesCustomValidators ? `import { CustomValidators } from '../../helpers/custom-validators';` : '')
        .replace('{{materialImports}}', matImportStatements)
        .replace('{{serviceImports}}', serviceImports.join(', '))
        .replace('{{modelImports}}', modelImports.join(', '))
        .replace('{{inlineInterfaces}}', inlineInterfaces)
        .replace(/{{kebab-case-name}}/g, resource.name)
        .replace(/{{PascalCaseName}}/g, pascalCase(resource.name))
        .replace('{{componentImports}}', [isEditable ? 'ReactiveFormsModule' : null, ...matModulesForComponentArray].filter(Boolean).join(', '))
        .replace('{{serviceClassName}}', resource.serviceName)
        .replace('{{snackBarInjection}}', (isEditable || itemActions.length > 0) ? `private readonly snackBar = inject(MatSnackBar);` : '')
        .replace('{{relationServiceInjections}}', relationServiceInjections)
        .replace('{{modelClassName}}', modelClassName)
        .replace('{{isEditable}}', String(isEditable))
        .replace('{{formDeclaration}}', formDeclaration)
        .replace('{{compareById}}', compareById)
        .replace('{{effectBlock}}', effectBlock)
        .replace('{{constructorBlock}}', constructorBlock)
        .replace('{{onSubmitBlock}}', onSubmitBlock)
        .replace('{{helperMethods}}', helperMethods.join('\n\n    '));

    sourceFile.addStatements(finalContent);
    sourceFile.fixMissingImports();
    sourceFile.formatText();
    sourceFile.saveSync();
}
