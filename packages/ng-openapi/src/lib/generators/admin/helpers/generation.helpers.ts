import { FormProperty, PolymorphicOption } from "../admin.types";
import { pascalCase, titleCase } from "@ng-openapi/shared";

export function getInitialValue(p: FormProperty): string {
    if (p.defaultValue !== undefined) {
        return JSON.stringify(p.defaultValue);
    }
    if (!p.required) {
        return "null";
    }
    switch (p.type) {
        case "boolean": return "false";
        case "number": return "0";
        case "array":
        case "array_object": return "[]";
        case "object":
        case "relationship":
        case "file":
        case "polymorphic": return "null";
        case "string":
        case "enum":
        default: return "''";
    }
}

export function generateFormControlsTS(properties: FormProperty[], parentModelName: string): string {
    return properties.map(p => {
        let controlValueString: string;

        if (p.type === 'object' && p.nestedProperties) {
            // Use the strongly typed interface name (e.g., 'PetCategory') passed from the generator.
            const nestedModelName = p.nestedObjectTypeName!;
            const nestedControls = generateFormControlsTS(p.nestedProperties, nestedModelName);
            controlValueString = `new FormGroup({\n    ${nestedControls}\n})`;
        } else if (p.type === 'polymorphic' && p.polymorphicOptions) {
            const typeSelectorValidators = p.required ? `, { validators: [Validators.required] }` : '';
            const subForms = p.polymorphicOptions.map(opt =>
                `'${opt.name}': new FormGroup({
        ${generateFormControlsTS(opt.properties, opt.name)}
    }, { disabled: true })`
            ).join(',\n    ');
            controlValueString = `new FormGroup({
        'typeSelector': new FormControl<string | null>(null${typeSelectorValidators}),
        ${subForms}
    })`;
        } else if (p.type === 'array_object' || p.type === 'array') {
            const validators = p.validators.length > 0 ? `{ validators: [${p.validators.join(', ')}] }` : '';
            let initialControls = '[]';
            if (p.defaultValue && Array.isArray(p.defaultValue)) {
                initialControls = `[${p.defaultValue.map(val => `new FormControl(${JSON.stringify(val)})`).join(', ')}]`;
            }
            controlValueString = `new FormArray(${initialControls}${validators ? ', ' + validators : ''})`;
        } else if (p.type === 'file') {
            const validators = p.validators.length > 0 ? `{ validators: [${p.validators.join(", ")}] }` : '';
            controlValueString = `new FormControl<File | null>(null${validators ? ', ' + validators : ''})`;
        } else {
            const initialValue = getInitialValue(p);
            const options: string[] = [];
            if (p.validators.length > 0) { options.push(`validators: [${p.validators.join(", ")}]`); }
            const isNullable = !p.required && p.defaultValue === undefined;
            if (!isNullable) { options.push("nonNullable: true"); }
            const optionsString = options.length > 0 ? `{ ${options.join(", ")} }` : "";

            const typeArgument = `${parentModelName}['${p.name}']${isNullable ? " | null" : ""}`;

            controlValueString = `new FormControl<${typeArgument}>(${initialValue}${optionsString ? ', ' + optionsString : ''})`;
        }
        return `'${p.name}': ${controlValueString}`;
    }).join(',\n    ');
}

function generatePolymorphicSwitchHTML(options: PolymorphicOption[]): string {
    const cases = options.map(opt => `
        @case ('${opt.name}') {
            <div formGroupName="${opt.name}" class="nested-form-group">
                ${generateFormFieldsHTML(opt.properties)}
            </div>
        }`).join('');
    return `@switch (form.get('item.typeSelector')?.value) {${cases} }`;
}

export function generateFormFieldsHTML(properties: FormProperty[], isViewMode = false): string {
    if (isViewMode) {
        const details = properties.map(p => `
    <dt>${titleCase(p.name)}</dt>
    <dd>{{ data()?.${p.name} }}</dd>`).join('');
        return `<dl class="details-list">${details}</dl>`;
    }

    return properties.map(p => {
        const label = titleCase(p.name);
        const isRequired = p.required ? 'required' : '';
        switch (p.inputType) {
            case 'slider':
                return `<mat-slider discrete thumbLabel [min]="${p.min}" [max]="${p.max}" formControlName="${p.name}"></mat-slider>`;
            case 'button-toggle-group':
                return `<div><label class="mat-body-2">${label}</label><mat-button-toggle-group formControlName="${p.name}" ${isRequired}>
                @for (val of [${p.enumValues!.map(e => `'${e}'`).join(', ')}]; track val) { <mat-button-toggle [value]="val">{{ val }}</mat-button-toggle> }
                </mat-button-toggle-group></div>`;
            case 'checkbox':
                return `<mat-checkbox formControlName="${p.name}" ${isRequired}>${label}</mat-checkbox>`;
            case 'chip-list':
                { const singularName = p.name.endsWith('s') ? p.name.slice(0, -1) : p.name;
                return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><mat-chip-grid #chipGrid${pascalCase(p.name)}>
                @for (item of ${p.name}Signal | async; track item) {<mat-chip-row (removed)="remove${pascalCase(p.name)}(item)">{{item}}<button matChipRemove><mat-icon>cancel</mat-icon></button></mat-chip-row>}
                <input placeholder="New ${singularName}..." [matChipInputFor]="chipGrid${pascalCase(p.name)}" (matChipInputTokenEnd)="add${pascalCase(p.name)}($event)"/></mat-chip-grid></mat-form-field>`; }
            case 'datepicker':
                return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><input matInput [matDatepicker]="picker${p.name}" formControlName="${p.name}" ${isRequired}><mat-datepicker-toggle matSuffix [for]="picker${p.name}"></mat-datepicker-toggle><mat-datepicker #picker${p.name}></mat-datepicker></mat-form-field>`;
            case 'select':
            case 'radio-group':
                { const options = p.enumValues!.map(val => p.inputType === 'select' ? `<mat-option value="${val}">${val}</mat-option>` : `<mat-radio-button value="${val}">${val}</mat-radio-button>`).join('\n');
                const control = p.inputType === 'select' ? `<mat-select formControlName="${p.name}" ${isRequired}>${options}</mat-select>` : `<mat-radio-group formControlName="${p.name}" ${isRequired}>${options}</mat-radio-group>`;
                return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label>${control}</mat-form-field>`; }
            case 'file':
                { const controlName = p.name;
                return `<div class="file-input-container"><span class="mat-body-2">${label}${p.required ? ' *' : ''}</span>
                <input type="file" class="hidden-file-input" #fileInput${pascalCase(controlName)} (change)="onFileSelected($event, '${controlName}')">
                <button mat-stroked-button type="button" (click)="fileInput${pascalCase(controlName)}.click()"><mat-icon>attach_file</mat-icon>Choose File</button>
                <span class="file-name">{{ form.get('${controlName}')?.value?.name || "No file chosen" }}</span></div>`; }
        }
        switch(p.type) {
            case 'object':
                return `<div formGroupName="${p.name}" class="nested-form-group"><h3>${label}</h3>${generateFormFieldsHTML(p.nestedProperties!)}</div>`;
            case 'polymorphic':
                return `<div formGroupName="${p.name}" class="polymorphic-group"><h4>${label}</h4><mat-form-field appearance="outline"><mat-label>${label} Type</mat-label>
                <mat-select formControlName="typeSelector" ${isRequired}>
                @for (opt of [${p.polymorphicOptions!.map(o => `'${o.name}'`).join(', ')}]; track opt) {<mat-option [value]="opt">{{ opt }}</mat-option>}
                </mat-select></mat-form-field>${generatePolymorphicSwitchHTML(p.polymorphicOptions!)}</div>`;
            case 'array_object':
                { const arrayName = p.name;
                const singularTitle = pascalCase(arrayName).replace(/s$/, '');
                return `<div class="form-array-container"><div class="form-array-header"><h4>${label}</h4><button type="button" mat-stroked-button (click)="add${singularTitle}()">
                 <mat-icon>add</mat-icon> Add ${singularTitle}</button></div><div formArrayName="${arrayName}">
                 @for (item of ${arrayName}.controls; track $index; let i = $index) {
                     <div [formGroupName]="i" class="form-array-item"><div class="form-array-item-fields">${generateFormFieldsHTML(p.nestedProperties!)}</div>
                     <button type="button" mat-icon-button color="warn" (click)="remove${singularTitle}(i)"><mat-icon>delete</mat-icon></button></div>
                 }</div></div>`; }
            case 'relationship':
                return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><mat-select formControlName="${p.name}" ${isRequired} [compareWith]="compareById">
                @for(option of ${p.name}Options | async; track option.id) {<mat-option [value]="option">{{ option.${p.relationDisplayField} }}</mat-option>}
                </mat-select></mat-form-field>`;
        }
        const inputType = p.inputType === 'textarea' ? 'textarea' : 'input';
        const typeAttr = p.inputType === 'textarea' ? '' : `type="${p.inputType || 'text'}"`;
        if (p.type === 'boolean') {
            return `<div class="form-field-container"><mat-checkbox formControlName="${p.name}" ${isRequired}>${label}</mat-checkbox></div>`;
        }
        return `<mat-form-field appearance="outline"><mat-label>${label}</mat-label><${inputType} matInput formControlName="${p.name}" ${typeAttr} ${isRequired}></${inputType}></mat-form-field>`;
    }).join('\n');
}
