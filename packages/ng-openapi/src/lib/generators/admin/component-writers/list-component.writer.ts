import * as path from 'path';
import { Project } from 'ts-morph';
import { titleCase, pascalCase } from "@ng-openapi/shared";
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
    const hasCollectionActions = collectionActions.length > 0;
    const createBtn = resource.operations.create ? `<button mat-flat-button color="primary" [routerLink]="['../new']"><mat-icon>add</mat-icon><span>Create ${resource.titleName}</span></button>` : '';
    const pluralTitleName = plural(resource.titleName);

    // Generate the full component if there is a list OR if there are collection actions.
    if (resource.operations.list || hasCollectionActions) {
        const listOp = resource.operations.list;
        const filters = listOp?.filterParameters ?? [];

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

        const actionsMenu = hasCollectionActions ? `
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
        const sortHeader = listOp?.hasSorting ? 'mat-sort-header' : '';
        const columnsTemplate = resource.listColumns.map((col) => `<ng-container matColumnDef="${col}"><th mat-header-cell *matHeaderCellDef ${sortHeader}="${col}">${titleCase(col)}</th><td mat-cell *matCellDef="let element">{{element.${col}}}</td></ng-container>`).join("\n");

        const htmlContext = {
            pluralTitleName,
            columnsTemplate,
            createButtonTemplate: createBtn,
            editButtonTemplate: editBtn,
            deleteButtonTemplate: deleteBtn,
            filtersHtml,
            actionsMenuTemplate: actionsMenu,
            hasListOperation: !!listOp,
            hasPagination: !!listOp?.hasPagination,
        };
        htmlFile.insertText(0, renderTemplate(getTemplate("list.component.html.template"), htmlContext));

        const cssContent = `:host { display: block; padding: 2rem; } .header-actions { display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem; margin-bottom: 1rem; } .table-container { position: relative; } .loading-shade { position: absolute; top: 0; left: 0; bottom: 56px; right: 0; background: rgba(0, 0, 0, 0.15); z-index: 100; display: flex; align-items: center; justify-content: center; } .mat-elevation-z8 { width: 100%; } .actions-cell { width: 120px; text-align: right; } .filters-container { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; background-color: #f9f9f9; border-radius: 4px; margin-bottom: 1rem; } .filters-form { display: flex; flex-wrap: wrap; gap: 1rem; flex-grow: 1; } .no-data-message { text-align: center; padding: 2rem; color: #666; }`;
        cssFile.insertText(0, cssContent);

        const filterFormControls = filters.map(f => `'${f.name}': new FormControl(null)`).join(',\n      ');
        const hasFilters = filters.length > 0;

        const tsImports = new Set(['Component', 'inject', 'signal']);
        if (listOp) {
            tsImports.add('AfterViewInit');
            tsImports.add('ViewChild');
        }

        const materialModules: { [key: string]: string[] } = {
            '@angular/material/icon': ['MatIconModule'],
            '@angular/material/button': ['MatButtonModule'],
        };
        if(listOp) {
            Object.assign(materialModules, {
                '@angular/material/table': ['MatTableModule'], '@angular/material/tooltip': ['MatTooltipModule'],
                '@angular/material/progress-spinner': ['MatProgressSpinnerModule'],
            });
        }

        const specialImports: string[] = [];
        if (hasFilters) {
            specialImports.push(`import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';`);
            materialModules['@angular/material/form-field'] = ['MatFormFieldModule'];
            materialModules['@angular/material/input'] = ['MatInputModule'];
            if (filters.some(f => f.inputType === 'select')) {
                materialModules['@angular/material/select'] = ['MatSelectModule'];
            }
        }
        if (listOp?.hasPagination) {
            tsImports.add('MatPaginator');
            materialModules['@angular/material/paginator'] = ['MatPaginator', 'MatPaginatorModule'];
        }
        if (listOp?.hasSorting) {
            tsImports.add('MatSort');
            materialModules['@angular/material/sort'] = ['MatSort', 'MatSortModule'];
        }
        if (hasCollectionActions) {
            materialModules['@angular/material/menu'] = ['MatMenuModule'];
        }

        const componentImportNames = Object.values(materialModules).flatMap(imports => imports.filter(i => i.endsWith('Module')));
        const componentImports = ['CommonModule', 'RouterModule', ...componentImportNames];
        if (hasFilters) componentImports.push('ReactiveFormsModule');

        const materialImportsStr = Object.entries(materialModules).map(([path, imports]) => `import { ${[...new Set(imports)].join(', ')} } from '${path}';`).join('\n');

        const executeActionCases = collectionActions.map(a => `case '${a.methodName}': this.svc.${a.methodName}({} as any).subscribe({ next: () => { this.snackBar.open('Action successful.', 'OK', { duration: 3000 }); if(this['loadData']) this['loadData']().subscribe((data: any) => this.data.set(data)); }, error: (e) => this.snackBar.open('Action failed.', 'OK', { duration: 5000 }) }); break;`).join('\n');

        const collectionActionMethodTs = hasCollectionActions ? `
  readonly collectionActions = JSON.parse('${JSON.stringify(collectionActions)}');
  executeCollectionAction(action: any): void {
    if (!confirm(\`Are you sure you want to run: \${action.label}?\`)) return;
    switch(action.methodName) {
        ${executeActionCases}
        default: console.error('Unknown collection action:', action.methodName);
    }
}` : '';

        const deleteOp = resource.operations.delete;
        let deleteArgs = '';
        if (deleteOp) {
            const idParam = (deleteOp.parameters ?? []).find(p => p.in === 'path');
            const castType = deleteOp.idParamType !== 'string' ? ` as ${deleteOp.idParamType}` : '';

            deleteArgs = (deleteOp.parameters ?? []).map(p => {
                if (p.in === 'path') {
                    return `id${castType}`;
                }
                return 'undefined'; // Handle other params if needed in the future
            }).filter(p => p!== 'undefined').join(', ');
        }

        const tsContext = {
            collectionActionMethodTs,
            compName,
            componentClassName: `${resource.className}ListComponent`,
            componentImports: componentImports.join(', '),
            deleteArgs, // << ADD THIS and remove the old deleteIdParamName property
            deleteMethodName: resource.operations.delete?.methodName,
            displayedColumns: `[${resource.listColumns.map(c => `'${c}'`).join(", ")}, 'actions']`,
            filterFormControls,
            hasDeleteMethod: !!resource.operations.delete,
            hasFilters,
            hasNgAfterViewInit: !!listOp,
            hasPagination: !!listOp?.hasPagination,
            hasSorting: !!listOp?.hasSorting,
            implementsAfterViewInit: listOp ? 'implements AfterViewInit' : '',
            listMethodName: listOp?.methodName,
            materialImports: materialImportsStr,
            modelName: resource.modelName || 'any',
            pluralKebabName: resource.pluralName,
            serviceName: resource.serviceName,
            specialImports: specialImports.join('\n'),
            titleName: resource.titleName,
            tsImports: Array.from(tsImports).join(', '),
        };
        tsFile.addStatements(renderTemplate(getTemplate('list.component.ts.template'), tsContext));
    } else {
        // Path for Create-Only Shell Component
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
    }

    tsFile.formatText();
    htmlFile.saveSync();
    cssFile.saveSync();
    tsFile.saveSync();
}
