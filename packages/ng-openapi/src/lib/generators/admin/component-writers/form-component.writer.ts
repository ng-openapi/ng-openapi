import * as path from 'path';
import { Project } from 'ts-morph';
import { Resource } from '../admin.types';
import { pascalCase, titleCase, camelCase } from "@ng-openapi/shared";
import { generateFormControlsTS, generateFormFieldsHTML } from '../helpers/generation.helpers';

export function writeFormComponent(resource: Resource, project: Project, allResources: Resource[], adminDir: string, usesCustomValidators: boolean) {
    if (!resource.createModelName && !resource.operations.read) return;

    const dir = path.join(adminDir, resource.pluralName, `${resource.name}-form`);
    const compName = `${resource.name}-form.component`;
    const sourceFile = project.createSourceFile(path.join(dir, `${compName}.ts`), "", { overwrite: true });

    const isEditable = resource.isEditable;
    const formProperties = resource.formProperties ?? [];

    const itemActions = resource.actions.filter(a => a.level === 'item');
    const itemActionButtons = itemActions.map(a => `<button mat-stroked-button type="button" (click)="onAction('${a.methodName}')">${titleCase(a.label)}</button>`).join('\n');

    const htmlFormFields = generateFormFieldsHTML(formProperties, !isEditable);
    const htmlContent = `<div class="form-container">
    @if (isNewMode()) { <h2>Create new ${resource.titleName}</h2> }
    @if (isEditMode()) { <h2>Edit ${resource.titleName}</h2> }
    @if (isViewMode()) { <h2>View ${resource.titleName}</h2> }

    @if (isEditable) {
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="main-form">
            ${htmlFormFields}
            <div class="form-actions">
                <button type="submit" mat-flat-button color="primary" [disabled]="form.invalid">Save</button>
                <button type="button" mat-stroked-button (click)="onCancel()">Cancel</button>
            </div>
        </form>
    } @else {
        ${htmlFormFields}
        <div class="form-actions">
            ${itemActionButtons}
            <button type="button" mat-stroked-button (click)="onCancel()">Back</button>
        </div>
    }
</div>`;
    project.createSourceFile(path.join(dir, `${compName}.html`), htmlContent, { overwrite: true }).saveSync();
    project.createSourceFile(path.join(dir, `${compName}.css`), "/* Add component styles here */", { overwrite: true }).saveSync();

    const angularCoreImports = new Set(['Component', 'inject', 'computed', 'signal', 'input', 'effect']);
    if (isEditable && (formProperties.some(p => p.inputType === 'chip-list') || formProperties.some(p => p.type === 'relationship'))) {
        angularCoreImports.add('startWith');
    }
    const formControlFields = isEditable ? generateFormControlsTS(formProperties, resource.createModelName) : '';
    const relationshipProps = formProperties.filter(p => p.type === 'relationship');

    const relationServices = new Map(relationshipProps.map(p => [p.relationServiceName!, `private readonly ${camelCase(p.relationResourceName! + 'Svc')} = inject(${p.relationServiceName});`]));

    const formArrayChipProps = formProperties.filter(p => p.inputType === 'chip-list');
    const formArrayObjectProps = formProperties.filter(p => p.type === 'array_object');
    const polymorphicProps = formProperties.filter(p => p.type === 'polymorphic');
    const fileProps = formProperties.filter(p => p.type === 'file');

    const formArrayChipHelpers = formArrayChipProps.map(p => `
    readonly ${p.name}Signal = (this.form.get('${p.name}')! as any).valueChanges.pipe(startWith(this.form.get('${p.name}')!.value || []));
    add${titleCase(p.name)}(event: MatChipInputEvent): void { const value = (event.value || '').trim(); if (value) { const current = this.form.get('${p.name}')!.value; this.form.get('${p.name}')!.setValue([...new Set([...(current || []), value])]); } event.chipInput!.clear(); }
    remove${titleCase(p.name)}(item: string): void { const current = this.form.get('${p.name}')!.value; this.form.get('${p.name}')!.setValue(current.filter((i: string) => i !== item)); }`).join('\n');

    const formArrayObjectHelpers = formArrayObjectProps.map(p => {
        const singularTitle = titleCase(p.name).replace(/s$/, '');
        const formArrayGetter = `get ${p.name}(): FormArray { return this.form.get('${p.name}') as FormArray; }`;
        const createMethod = `create${singularTitle}(): FormGroup { return new FormGroup({ ${generateFormControlsTS(p.nestedProperties!, 'any')} }); }`;
        const addMethod = `add${singularTitle}(): void { this.${p.name}.push(this.create${singularTitle}()); }`;
        const removeMethod = `remove${singularTitle}(index: number): void { this.${p.name}.removeAt(index); }`;
        return `${formArrayGetter}\n${createMethod}\n${addMethod}\n${removeMethod}`;
    }).join('\n\n');

    const fileHelpers = fileProps.length > 0 ? `onFileSelected(event: Event, controlName: string): void { const file = (event.target as HTMLInputElement).files?.[0]; if (file) { this.form.get(controlName)!.setValue(file); } }` : '';

    const formArrayPatchLogic = formArrayObjectProps.map(p => {
        const singularTitle = titleCase(p.name).replace(/s$/, '');
        return `if (data.${p.name} && Array.isArray(data.${p.name})) {
            this.${p.name}.clear();
            data.${p.name}.forEach((item: any) => {
                const formGroup = this.create${singularTitle}();
                formGroup.patchValue(item);
                this.${p.name}.push(formGroup);
            });
        }`;
    }).join('');

    const polymorphicPatchLogic = polymorphicProps.map(p => {
        const optionsCases = p.polymorphicOptions!.map(opt => `if (data.${p.name} && Object.keys(data.${p.name}).some(k => ${JSON.stringify(opt.properties.map(prop => prop.name))}.includes(k))) { inferredType = '${opt.name}'; }`).join(' else ');
        return `if (data.${p.name}) { let inferredType: string | null = null; ${optionsCases}
            if (inferredType) { this.form.get('${p.name}.typeSelector')!.patchValue(inferredType, { emitEvent: true }); this.form.get(\`${p.name}.\${inferredType}\`)!.patchValue(data.${p.name}); }
        }`;
    }).join('\n');

    const readCall = resource.operations.read
        ? `this.svc.${resource.operations.read.methodName}({ ${resource.operations.read.idParamName}: id } as any).subscribe(data => this.data.set(data));`
        : '';
    const effectLogic = `effect(() => {
        const id = this.id();
        const data = this.data();
        if (id && !data) { ${readCall} }
        else if (data) { ${polymorphicPatchLogic}\nthis.form.patchValue(data as any); ${formArrayPatchLogic} }
        else if (!id) { this.form.reset(); }
        if (this.isViewMode()) { this.form.disable(); }
    });`;

    const constructorLogic = polymorphicProps.length > 0 ? `constructor() { ${polymorphicProps.map(p => {
        const optionsLogic = p.polymorphicOptions!.map(opt => `const ${opt.name.toLowerCase()}Form = this.form.get('${p.name}.${opt.name}')!;
            if (type === '${opt.name}') { ${opt.name.toLowerCase()}Form.enable(); } else { ${opt.name.toLowerCase()}Form.disable(); ${opt.name.toLowerCase()}Form.reset(); }`).join('\n');
        return `this.form.get('${p.name}.typeSelector')!.valueChanges.subscribe(type => { ${optionsLogic} });`;
    }).join('\n')} }` : 'constructor() {}';

    const itemActionLogic = itemActions.length > 0 ? `onAction(actionName: string): void {
        const id = this.id(); if (!id) return;
        switch(actionName) {
            ${itemActions.map(a => `case '${a.methodName}':
                this.svc.${a.methodName}({ ${a.idParamName}: id } as any).subscribe(() => this.snackBar.open('${titleCase(a.label)} completed.', 'Dismiss', { duration: 3000 }));
                break;`).join('\n')}
        }
    }`: '';

    const updateCall = resource.operations.update ? `this.svc.${resource.operations.update.methodName}({ ${resource.operations.update.idParamName}: this.id(), body: formValue } as any)` : 'null';
    const createCall = resource.operations.create ? `this.svc.${resource.operations.create.methodName}({ body: formValue } as any)` : 'null';
    const onSubmitLogic = `onSubmit(): void {
        this.form.markAllAsTouched(); if (this.form.invalid) { this.snackBar.open('Please correct the errors on the form.', 'Dismiss', { duration: 3000 }); return; }
        const formValue = this.form.getRawValue() as ${resource.createModelName};
        const action$ = this.isEditMode() ? ${updateCall} : ${createCall};
        action$?.subscribe({
            next: () => { this.snackBar.open('${resource.titleName} saved successfully.', 'Dismiss', { duration: 3000 }); this.router.navigate(['..'], { relativeTo: this.route }); },
            error: (err) => { console.error('Error saving ${resource.name}:', err); this.snackBar.open('Error: ${resource.titleName} could not be saved.', 'Dismiss', { duration: 5000 }); }
        });
    }`;

    const tsContent = `/* eslint-disable */
import { ${Array.from(angularCoreImports).join(", ")} } from '@angular/core';
import { CommonModule } from '@angular/common';
${isEditable ? "import { FormControl, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';" : ''}
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
${isEditable && formArrayChipProps.length > 0 ? "import { MatChipInputEvent } from '@angular/material/chips';" : ''}
${usesCustomValidators ? `import { CustomValidators } from '../../helpers/custom-validators';` : ''}
/* Material imports would be dynamically added here */

import { ${[...new Set([resource.serviceName, ...relationServices.keys()])].join(", ")} } from '../../../../services';
import { ${[...new Set([resource.modelName, resource.createModelName, ...relationshipProps.map(p => p.relationModelName!)].filter(Boolean))].join(", ")} } from '../../../../models';

@Component({
  selector: 'app-${resource.name}-form',
  standalone: true,
  imports: [CommonModule, ${isEditable ? "ReactiveFormsModule," : ""} /* Mat modules... */],
  templateUrl: './${compName}.html',
  styleUrls: ['./${compName}.css']
})
export class ${pascalCase(resource.name)}FormComponent {
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly svc = inject(${resource.serviceName});
    ${isEditable || itemActions.length > 0 ? `private readonly snackBar = inject(MatSnackBar);` : ''}
    ${Array.from(relationServices.values()).join('\n    ')}

    readonly data = signal<${resource.modelName || 'any'} | null>(null);
    readonly isEditable = ${isEditable};
    
    readonly id = input<string | number>();
    readonly isEditMode = computed(() => this.isEditable && !!this.id());
    readonly isViewMode = computed(() => !this.isEditable && !!this.id());
    readonly isNewMode = computed(() => !this.id());

    readonly form = ${isEditable ? `new FormGroup({
        ${formControlFields}
    })` : 'null as any'};
    compareById = (o1: any, o2: any): boolean => o1?.id === o2?.id;
    
    ${(resource.operations.read && isEditable) ? effectLogic : ''}
    ${isEditable ? constructorLogic : ''}
    ${isEditable ? onSubmitLogic : ''}
    onCancel(): void { this.router.navigate(['..'], { relativeTo: this.route }); }
    ${isEditable ? formArrayChipHelpers : ''}
    ${isEditable ? formArrayObjectHelpers : ''}
    ${isEditable ? fileHelpers : ''}
    ${itemActionLogic}
}`;

    sourceFile.addStatements(tsContent);
    sourceFile.saveSync();
}
