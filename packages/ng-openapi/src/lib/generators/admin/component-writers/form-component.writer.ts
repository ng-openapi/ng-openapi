// packages/ng-openapi/src/lib/generators/admin/component-writers/form-component.writer.ts

import * as path from 'path';
import { Project } from 'ts-morph';
import { Resource } from '../admin.types';
import { pascalCase, titleCase } from "@ng-openapi/shared";
import { generateFormControlsTS, generateFormFieldsHTML } from '../helpers/generation.helpers';

export function writeFormComponent(resource: Resource, project: Project, allResources: Resource[], adminDir: string) {
    if (!resource.isEditable && !resource.operations.read) return;

    const dir = path.join(adminDir, resource.pluralName, `${resource.name}-form`);
    const compName = `${resource.name}-form.component`;
    const htmlFile = project.createSourceFile(path.join(dir, `${compName}.html`), "", { overwrite: true });
    const cssFile = project.createSourceFile(path.join(dir, `${compName}.css`), "", { overwrite: true });
    const tsFile = project.createSourceFile(path.join(dir, `${compName}.ts`), "", { overwrite: true });

    const coreModules = new Set(["CommonModule"]);
    const materialModules = new Set<string>();
    const componentProviders = new Set<string>();
    const chipListSignals: { name: string, pascalName: string }[] = [];

    let fields = '';
    if (resource.isEditable) {
        coreModules.add("ReactiveFormsModule");
        fields = generateFormFieldsHTML(resource.formProperties, materialModules, componentProviders, chipListSignals);
    }

    materialModules.add("MatButtonModule");
    materialModules.add("MatIconModule");
    if (resource.isEditable) materialModules.add("MatSnackBarModule");

    const itemActions = resource.actions.filter(a => a.level === 'item');
    const itemActionsButtons = itemActions.length > 0 ? `
    <div class="item-actions">
        @for(action of itemActions; track action.methodName) {
            <button mat-stroked-button color="accent" (click)="executeItemAction(action)">{{ action.label }}</button>
        }
    </div>` : '';

    const readonlyViewFields = resource.formProperties.map(p => {
        const label = titleCase(p.name);
        return `<div class="detail-item">
        <dt>${label}</dt>
        <dd>{{ data()?.${p.name} }}</dd>
    </div>`}).join('\n');

    const formTemplate = `
<div class="form-header">
<h1>
    @if (isNewMode()) { Create ${resource.titleName} }
    @if (isEditMode()) { Edit ${resource.titleName} }
    @if (isViewMode()) { View ${resource.titleName} }
</h1>
${itemActionsButtons}
</div>

@if (isEditable) {
<form [formGroup]="form" (ngSubmit)="onSubmit()" class="form-container">
    ${fields}
    <div class="action-buttons">
        <button mat-stroked-button type="button" (click)="onCancel()">Cancel</button>
        <button mat-flat-button color="primary" type="submit">Save</button>
    </div>
</form>
} @else {
@if(data(); as item) {
<dl class="details-list">
    ${readonlyViewFields}
</dl>
} @else {
    <p>Loading...</p>
}
<div class="action-buttons">
   <button mat-stroked-button type="button" (click)="onCancel()">Back to List</button>
</div>
}`;
    htmlFile.insertText(0, formTemplate);

    const cssContent = `:host { display: block; padding: 2rem; } .form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; } .item-actions { display: flex; gap: 0.5rem; } .form-container, .details-list { display: flex; flex-direction: column; gap: 1rem; max-width: 600px; } .details-list { gap: 1.5rem; } .detail-item dt { font-weight: bold; color: #666; margin-bottom: 0.25rem; } .detail-item dd { margin-left: 0; font-size: 1.1em; } .action-buttons { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }`;
    cssFile.insertText(0, cssContent);

    const relationshipProps = resource.formProperties.filter(p => p.type === 'relationship');
    const relationServices = new Map<string, string>();
    relationshipProps.forEach(p => relationServices.set(p.relationServiceName!, p.relationResourceName!));
    const relationServiceInjections = Array.from(relationServices.entries()).map(([serviceName, resName]) => `private readonly ${resName}Svc = inject(${serviceName});`).join('\n  ');
    const relationDataSignals = relationshipProps.map(p => `readonly ${p.relationResourceName}Items = signal<${p.relationModelName}[]>([]);`).join('\n  ');
    const relationDataFetches = Array.from(relationServices.entries()).map(([_, resName]) => `this.${resName}Svc.${allResources.find(r => r.name === resName)!.operations.list!.methodName}({} as any).subscribe(data => this.${resName}Items.set(data as any[]));`).join('\n    ');

    const chipListMethods = chipListSignals.map(p => `readonly ${p.name}Signal = (this.form.get('${p.name}')! as any).valueChanges.pipe(startWith(this.form.get('${p.name}')!.value || []));\nadd${p.pascalName}(event: MatChipInputEvent): void { const value = (event.value || '').trim(); if (value) { const current = this.form.get('${p.name}')!.value; this.form.get('${p.name}')!.setValue([...new Set([...(current || []), value])]); } event.chipInput!.clear(); }\nremove${p.pascalName}(item: string): void { const current = this.form.get('${p.name}')!.value; this.form.get('${p.name}')!.setValue(current.filter((i: string) => i !== item)); }`).join("\n");

    const formArrayMethods = resource.formProperties.filter(p => p.type === 'array_object' && p.nestedProperties).map(p => {
        const singularName = p.name.endsWith('s') ? p.name.slice(0, -1) : p.name;
        const singularPascal = pascalCase(singularName);
        const formGroupStructure = generateFormControlsTS(p.nestedProperties!, `${resource.createModelName}['${p.name}'][0]`);
        return `
get ${p.name}(): FormArray { return this.form.get('${p.name}') as FormArray; }
create${singularPascal}(): FormGroup { return new FormGroup({ ${formGroupStructure} }); }
add${singularPascal}(): void { this.${p.name}.push(this.create${singularPascal}()); }
remove${singularPascal}(index: number): void { this.${p.name}.removeAt(index); }`;
    }).join('\n\n');

    const formArrayPatchLogic = resource.formProperties.filter(p => p.type === 'array_object' && p.nestedProperties).map(p => {
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

    const materialImportsMap = { MatFormFieldModule: "@angular/material/form-field", MatInputModule: "@angular/material/input", MatButtonModule: "@angular/material/button", MatIconModule: "@angular/material/icon", MatCheckboxModule: "@angular/material/checkbox", MatSlideToggleModule: "@angular/material/slide-toggle", MatSelectModule: "@angular/material/select", MatRadioModule: "@angular/material/radio", MatSliderModule: "@angular/material/slider", MatChipsModule: "@angular/material/chips", MatButtonToggleModule: "@angular/material/button-toggle", MatDatepickerModule: "@angular/material/datepicker", MatExpansionModule: "@angular/material/expansion", MatTooltipModule: "@angular/material/tooltip", MatSnackBarModule: "@angular/material/snack-bar" };
    const materialImports = Array.from(materialModules).map((mod) => `import { ${mod} } from '${materialImportsMap[mod as keyof typeof materialImportsMap]}';`).join("\n");

    const formControlFields = resource.isEditable ? generateFormControlsTS(resource.formProperties, resource.createModelName) : '';
    const angularCoreImports = new Set(["Component", "inject", "computed", "signal", "input", "effect"]);

    const executeItemActionCases = itemActions.map(a => `case '${a.methodName}': this.svc.${a.methodName}({ ${resource.operations.read!.idParamName!}: this.id() } as any).subscribe({ next: () => this.snackBar.open('Action successful.', 'OK', { duration: 3000 }), error: (e) => this.snackBar.open('Action failed.', 'OK', { duration: 5000 }) }); break;`).join('\n');
    const itemActionMethod = itemActions.length > 0 ? `
readonly itemActions = JSON.parse('${JSON.stringify(itemActions)}');
executeItemAction(action: any): void {
if (!confirm(\`Are you sure you want to run: \${action.label}?\`)) return;
switch(action.methodName) {
    ${executeItemActionCases}
    default: console.error('Unknown item action:', action.methodName);
}
}` : '';

    let submitAction = '';
    if (resource.operations.update && resource.operations.create) {
        submitAction = `const action$ = this.isEditMode()
  ? this.svc.${resource.operations.update.methodName}({ body: formValue, ${resource.operations.update.idParamName}: this.id() } as any)
  : this.svc.${resource.operations.create.methodName}({ body: formValue } as any);`;
    } else if (resource.operations.update) {
        submitAction = `const action$ = this.svc.${resource.operations.update.methodName}({ body: formValue, ${resource.operations.update.idParamName}: this.id() } as any);`;
    } else if (resource.operations.create) {
        submitAction = `const action$ = this.svc.${resource.operations.create.methodName}({ body: formValue } as any);`;
    }

    const constructorLogic = `
constructor() {
${relationDataFetches}
${resource.operations.read ? `
effect(() => {
    const currentId = this.id();
    if ((this.isEditMode() || this.isViewMode()) && currentId) {
      this.svc.${resource.operations.read.methodName}({ ${resource.operations.read.idParamName}: currentId } as any).subscribe(data => {
        if (this.isEditable) {
            ${formArrayPatchLogic}
            this.form.patchValue(data as any);
        } else {
            this.data.set(data as any);
        }
      });
    }
});` : ''}
}`;

    const tsContent = `/* eslint-disable */
import { ${Array.from(angularCoreImports).join(", ")} } from '@angular/core';
import { CommonModule } from '@angular/common';
${resource.isEditable ? "import { FormControl, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';" : ''}
import { Router, ActivatedRoute } from '@angular/router';
${resource.isEditable ? "import { MatSnackBar } from '@angular/material/snack-bar';" : ''}
${materialImports}
import { ${[...new Set([resource.serviceName, ...relationServices.keys()])].join(", ")} } from '../../../../services';
import { ${[...new Set([resource.modelName, resource.createModelName, ...relationshipProps.map(p => p.relationModelName!)].filter(Boolean))].join(", ")} } from '../../../../models';

@Component({
  selector: 'app-${resource.name}-form',
  standalone: true,
  imports: [ ${[...coreModules, ...materialModules].join(", ")} ],
  templateUrl: './${compName}.html',
  styleUrls: ['./${compName}.css']
})
export class ${resource.className}FormComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(${resource.serviceName});
  ${resource.isEditable ? `private readonly snackBar = inject(MatSnackBar);` : ''}
  ${relationServiceInjections}
  
  readonly data = signal<${resource.modelName} | null>(null);
  readonly isEditable = ${resource.isEditable};
  ${relationDataSignals}
  
  readonly id = input<string | number>();
  readonly isEditMode = computed(() => this.isEditable && !!this.id());
  readonly isViewMode = computed(() => !this.isEditable && !!this.id());
  readonly isNewMode = computed(() => !this.id());

  readonly form = ${resource.isEditable ? `new FormGroup({ ${formControlFields} });` : 'new FormGroup({});'}
  compareById = (o1: any, o2: any): boolean => o1?.id === o2?.id;

  ${constructorLogic}

  ${resource.isEditable ? `
  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.snackBar.open('Please correct the errors on the form.', 'Dismiss', { duration: 3000 });
      return;
    }
    const formValue = this.form.getRawValue() as ${resource.createModelName};
    ${submitAction}

    action$.subscribe({
      next: () => {
        this.snackBar.open('${resource.titleName} saved successfully.', 'Dismiss', { duration: 3000 });
        this.router.navigate(['..'], { relativeTo: this.route });
      },
      error: (err) => {
        console.error('Error saving ${resource.name}:', err);
        this.snackBar.open('Error: ${resource.titleName} could not be saved.', 'Dismiss', { duration: 5000 });
      }
    });
  }` : ''}

  onCancel(): void { this.router.navigate(['..'], { relativeTo: this.route }); }

  ${itemActionMethod}
  ${formArrayMethods}
  ${chipListMethods}
}`;
    tsFile.addStatements(tsContent);
    tsFile.formatText();
    htmlFile.saveSync();
    cssFile.saveSync();
    tsFile.saveSync();
}
