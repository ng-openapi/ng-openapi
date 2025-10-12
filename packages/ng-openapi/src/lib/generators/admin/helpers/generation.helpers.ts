import { FormProperty } from "../admin.types";
import { pascalCase, titleCase } from "@ng-openapi/shared";

export function getInitialValue(p: FormProperty): string {
    if (p.defaultValue !== undefined) { return JSON.stringify(p.defaultValue); }
    if (!p.required) { return "null"; }
    // For required fields without a default, provide a sensible non-null initial value
    switch (p.type) {
        case "boolean": return "false";
        case "number": return "0";
        case "array": case "array_object": return "[]";
        case "object": case "relationship": case "file": return "null"; // Still may need null for objects / files
        case "string": case "enum": default: return "''"; // Use empty string for required strings
    }
}

export function generateFormControlsTS(properties: FormProperty[], createModelName: string): string {
    return properties.map(p => {
        if (p.type === 'object' && p.nestedProperties) {
            const nestedControls = generateFormControlsTS(p.nestedProperties, `${createModelName}['${p.name}']`);
            return `'${p.name}': new FormGroup({\n    ${nestedControls}\n})`;
        } else if (p.type === 'array_object' || p.type === 'array') {
            const validators = p.validators.length > 0 ? `, { validators: [${p.validators.join(', ')}] }` : '';
            // FIX: Handle default values for FormArray
            let initialControls = '[]';
            if (p.defaultValue && Array.isArray(p.defaultValue)) {
                initialControls = `[\n      ${p.defaultValue.map(val => `new FormControl(${JSON.stringify(val)})`).join(',\n      ')}\n    ]`;
            }
            return `'${p.name}': new FormArray(${initialControls}${validators})`;
        } else if (p.type === 'file') {
            const validators = p.required ? `{ validators: [Validators.required] }` : '';
            return `'${p.name}': new FormControl<File | null>(null${validators ? ', ' + validators : ''})`;
        } else {
            const initialValue = getInitialValue(p);
            const options: string[] = [];
            if (p.validators.length > 0) { options.push(`validators: [${p.validators.join(", ")}]`); }

            const isNullable = !p.required && p.defaultValue === undefined;
            if (!isNullable) { options.push("nonNullable: true"); }

            const optionsString = options.length > 0 ? `, { ${options.join(", ")} }` : "";

            const typeArgument = `${createModelName}['${p.name}']${isNullable ? " | null" : ""}`;

            return `'${p.name}': new FormControl<${typeArgument}>(${initialValue}${optionsString})`;
        }
    }).join(',\n    ');
}

export function generateFormFieldsHTML(properties: FormProperty[], materialModules: Set<string>, componentProviders: Set<string>, chipListSignals: { name: string, pascalName: string }[]): string {
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
            case "file": { materialModules.add("MatButtonModule"); materialModules.add("MatIconModule"); return `<div class="form-field-container"><label class="mat-body-strong">${label}</label><div class="file-input-control"><input type="file" class="hidden-file-input" #fileInput${pascalCase(p.name)} (change)="onFileSelected($event, '${p.name}')"><button mat-stroked-button type="button" (click)="fileInput${pascalCase(p.name)}.click()"><mat-icon>attach_file</mat-icon><span>Choose File</span></button><span class="file-name">{{ form.get('${p.name}')?.value?.name || "No file chosen" }}</span></div>${errors}</div>`; }
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
