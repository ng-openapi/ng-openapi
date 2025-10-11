import * as path from 'path';
import { Project } from 'ts-morph';
import { titleCase } from "@ng-openapi/shared";
import { Resource } from '../admin.types';
import { plural } from '../admin.helpers';
import { getTemplate, renderTemplate } from '../helpers/template.reader';

export function writeListComponent(resource: Resource, project: Project, adminDir: string) {
    const dir = path.join(adminDir, resource.pluralName, `${resource.pluralName}-list`);
    const compName = `${resource.pluralName}-list.component`;
    const htmlFile = project.createSourceFile(path.join(dir, `${compName}.html`), "", { overwrite: true });
    const cssFile = project.createSourceFile(path.join(dir, `${compName}.css`), "", { overwrite: true });
    const tsFile = project.createSourceFile(path.join(dir, `${compName}.ts`), "", { overwrite: true });

    const collectionActions = resource.actions.filter(a => a.level === 'collection');
    const createBtn = resource.operations.create ? `<button mat-flat-button color="primary" [routerLink]="['../new']"><mat-icon>add</mat-icon><span>Create ${resource.titleName}</span></button>` : '';
    const pluralTitleName = plural(resource.titleName);

    // Path 1: Create-Only Shell Component (No List Operation)
    if (!resource.operations.list) {
        htmlFile.insertText(0, `
<div class="header-actions">
    <h2>${pluralTitleName}</h2>
    <div class="header-buttons">
      ${createBtn}
    </div>
</div>
<div class="no-data-message">
    <p>This resource does not have a list view. You can create new items.</p>
</div>
        `);

        cssFile.insertText(0, `:host { display: block; padding: 2rem; } .header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; } .header-buttons { display: flex; gap: 0.5rem; } .no-data-message { text-align: center; padding: 2rem; color: #666; }`);

        tsFile.addStatements(`/* eslint-disable */
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-${resource.pluralName}-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './${compName}.html',
  styleUrls: ['./${compName}.css']
})
export class ${resource.className}ListComponent {}
`);
        // Path 2: Full List Component
    } else {
        const filters = resource.operations.list!.filterParameters || [];

        let filtersHtml = '';
        if (filters.length > 0) {
            const filterControlsHtml = filters.map(f => {
                const label = titleCase(f.name);
                if (f.inputType === 'select') {
                    const options = f.enumValues!.map(val => `<mat-option value="${val}">${val}</mat-option>`).join('\n                        ');
                    return `<mat-form-field appearance="outline">
                        <mat-label>${label}</mat-label>
                        <mat-select formControlName="${f.name}">
                            <mat-option [value]="null">Any</mat-option>
                            ${options}
                        </mat-select>
                    </mat-form-field>`;
                }
                const inputType = f.inputType === 'number' ? 'number' : 'text';
                return `<mat-form-field appearance="outline">
                    <mat-label>${label}</mat-label>
                    <input matInput formControlName="${f.name}" placeholder="Search by ${f.name}..." type="${inputType}">
                </mat-form-field>`;
            }).join('\n');

            filtersHtml = `
<div class="filters-container">
    <form [formGroup]="filterForm" class="filters-form">
        ${filterControlsHtml}
    </form>
    <button mat-stroked-button (click)="resetFilters()" matTooltip="Reset Filters">
        <mat-icon>refresh</mat-icon>
        <span>Reset</span>
    </button>
</div>`;
        }

        const actionsMenu = collectionActions.length > 0 ? `
<button mat-flat-button [matMenuTriggerFor]="actionsMenu" color="accent">
    <mat-icon>more_vert</mat-icon>
    <span>Actions</span>
</button>
<mat-menu #actionsMenu="matMenu">
    @for (action of collectionActions; track action.methodName) {
        <button mat-menu-item (click)="executeCollectionAction(action)">
            <span>{{ action.label }}</span>
        </button>
    }
</mat-menu>` : '';

        const idKey = resource.operations.read?.idParamName || resource.operations.delete?.idParamName || 'id';
        const editBtn = (resource.operations.read || resource.operations.update) ? `<button mat-icon-button [routerLink]="['../', element.${idKey}]" matTooltip="View/Edit ${resource.titleName}"><mat-icon>edit</mat-icon></button>` : '';
        const deleteBtn = resource.operations.delete ? `<button mat-icon-button color="warn" (click)="delete(element.${idKey})" matTooltip="Delete ${resource.titleName}"><mat-icon>delete</mat-icon></button>` : '';
        const columnsTemplate = resource.listColumns.map((col) => `<ng-container matColumnDef="${col}"><th mat-header-cell *matHeaderCellDef>${titleCase(col)}</th><td mat-cell *matCellDef="let element">{{element.${col}}}</td></ng-container>`).join("\n");

        const templateContext = { ...resource, pluralTitleName, columnsTemplate, createButtonTemplate: createBtn, editButtonTemplate: editBtn, deleteButtonTemplate: deleteBtn, filtersHtml, actionsMenuTemplate: actionsMenu };
        htmlFile.insertText(0, renderTemplate(getTemplate("list.component.html.template"), templateContext));

        const cssContent = `:host { display: block; padding: 2rem; } .header-actions { display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem; margin-bottom: 1rem; } .mat-elevation-z8 { width: 100%; } .actions-cell { width: 120px; text-align: right; } .filters-container { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; background-color: #f9f9f9; border-radius: 4px; margin-bottom: 1rem; } .filters-form { display: flex; flex-wrap: wrap; gap: 1rem; flex-grow: 1; }`;
        cssFile.insertText(0, cssContent);

        const filterFormControls = filters.map(f => `'${f.name}': new FormControl(null)`).join(',\n      ');
        const hasFilters = filters.length > 0;

        const tsImports = new Set(['Component', 'inject', 'signal', 'WritableSignal']);
        const materialModules: { [key: string]: string } = {
            MatTableModule: '@angular/material/table',
            MatIconModule: '@angular/material/icon',
            MatButtonModule: '@angular/material/button',
            MatTooltipModule: '@angular/material/tooltip',
        };
        const specialImports: string[] = [];
        if (hasFilters) {
            specialImports.push(`import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';`);
            specialImports.push(`import { debounceTime, distinctUntilChanged } from 'rxjs';`);
            materialModules['MatFormFieldModule'] = '@angular/material/form-field';
            materialModules['MatInputModule'] = '@angular/material/input';
            if (filters.some(f => f.inputType === 'select')) {
                materialModules['MatSelectModule'] = '@angular/material/select';
            }
        }
        if (collectionActions.length > 0) {
            materialModules['MatMenuModule'] = '@angular/material/menu';
        }

        const componentImports = [ 'CommonModule', 'RouterModule', ...Object.keys(materialModules)];
        if (hasFilters) componentImports.push('ReactiveFormsModule');

        const materialImportsStr = Object.entries(materialModules).map(([mod, path]) => `import { ${mod} } from '${path}';`).join('\n');

        const executeActionCases = collectionActions.map(a => `case '${a.methodName}': this.svc.${a.methodName}({} as any).subscribe({ next: () => { this.snackBar.open('Action successful.', 'OK', { duration: 3000 }); this.loadData(); }, error: (e) => this.snackBar.open('Action failed.', 'OK', { duration: 5000 }) }); break;`).join('\n');
        const collectionActionMethod = collectionActions.length > 0 ? `
readonly collectionActions = JSON.parse('${JSON.stringify(collectionActions)}');
executeCollectionAction(action: any): void {
    if (!confirm(\`Are you sure you want to run: \${action.label}?\`)) return;
    switch(action.methodName) {
        ${executeActionCases}
        default: console.error('Unknown collection action:', action.methodName);
    }
}` : '';

        const tsContent = `/* eslint-disable */
import { ${Array.from(tsImports).join(', ')} } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
${specialImports.join('\n')}
${materialImportsStr}
import { ${resource.serviceName} } from '../../../services';
import { ${resource.modelName} } from '../../../models';

@Component({
  selector: 'app-${resource.pluralName}-list',
  standalone: true,
  imports: [${componentImports.join(', ')}],
  templateUrl: './${compName}.html',
  styleUrls: ['./${compName}.css']
})
export class ${resource.className}ListComponent {
  private readonly svc = inject(${resource.serviceName});
  private readonly snackBar = inject(MatSnackBar);
  readonly data: WritableSignal<${resource.modelName}[]> = signal([]);
  readonly displayedColumns: string[] = [${resource.listColumns.map(c => `'${c}'`).join(", ")}, 'actions'];
  ${hasFilters ? `
  readonly filterForm = new FormGroup({
      ${filterFormControls}
  });` : ''}

  constructor() {
    this.loadData();
    ${hasFilters ? `
    this.filterForm.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => this.loadData());` : ''}
  }

  loadData(): void {
    const filters = ${hasFilters ? 'this.filterForm.getRawValue()' : '{}'};
    const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
        if (value !== null && value !== undefined && value !== '') { (acc as any)[key] = value; }
        return acc;
    }, {});
    this.svc.${resource.operations.list!.methodName}(cleanFilters as any).subscribe((d) => this.data.set(d as any[]));
  }
  ${hasFilters ? `
  resetFilters(): void {
    this.filterForm.reset();
  }`: ''}
  ${resource.operations.delete ? `
  delete(id: number | string): void {
    if (confirm('Are you sure?')) {
      this.svc.${resource.operations.delete.methodName}({ ${resource.operations.delete.idParamName}: id } as any).subscribe(() => this.loadData());
    }
  }` : ''}
  ${collectionActionMethod}
}`;
        tsFile.addStatements(tsContent);
    }

    tsFile.formatText();
    htmlFile.saveSync();
    cssFile.saveSync();
    tsFile.saveSync();
}
