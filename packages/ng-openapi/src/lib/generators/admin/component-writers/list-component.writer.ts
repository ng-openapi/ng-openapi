import * as path from 'path';
import {
    Project,
    ClassDeclaration,
    PropertyDeclarationStructure,
    MethodDeclarationStructure,
    OptionalKind,
} from "ts-morph";
import { titleCase, pascalCase, camelCase } from "@ng-openapi/shared";
import { Resource } from '../admin.types';
import { plural } from '../admin.helpers';

// A complete map of all possible Material modules used by the list component
const MATERIAL_MODULE_MAP: Record<string, string> = {
    MatButtonModule: '@angular/material/button',
    MatIconModule: '@angular/material/icon',
    MatProgressSpinnerModule: '@angular/material/progress-spinner',
    MatTableModule: '@angular/material/table',
    MatTooltipModule: '@angular/material/tooltip',
    MatPaginatorModule: '@angular/material/paginator',
    MatSortModule: '@angular/material/sort',
    MatFormFieldModule: '@angular/material/form-field',
    MatInputModule: '@angular/material/input',
    MatSelectModule: '@angular/material/select',
    MatMenuModule: '@angular/material/menu',
};

/**
 * Writes the component.ts, component.html, and component.css files for a resource's list view.
 */
export function writeListComponent(resource: Resource, project: Project, adminDir: string): void {
    const dir = path.join(adminDir, resource.pluralName, `${resource.pluralName}-list`);
    const compName = `${resource.pluralName}-list.component`;

    const hasCollectionActions = resource.actions.some(a => a.level === 'collection');

    if (!resource.operations.list && !hasCollectionActions && !resource.operations.create) {
        return;
    }

    const sourceFile = project.createSourceFile(path.join(dir, `${compName}.ts`), "", { overwrite: true });

    // Explicitly add service import
    const componentDir = path.dirname(sourceFile.getFilePath());
    const servicePath = path.resolve(componentDir, `../../../services`/*/${camelCase(resource.pluralName)}.service*/);
    const relativeServicePath = path.relative(componentDir, servicePath).replace(/\\/g, '/');
    sourceFile.addImportDeclaration({
        namedImports: [resource.serviceName],
        moduleSpecifier: `./${relativeServicePath}`.replace(/\.ts$/, ''),
    });

    const className = `${pascalCase(resource.pluralName)}ListComponent`;
    const classDeclaration = sourceFile.addClass({
        name: className,
        isExported: true,
    });

    if (resource.operations.list) {
        generateFullListComponent(classDeclaration, resource);
    } else {
        generateActionShellComponent(classDeclaration, resource);
    }

    project.createSourceFile(path.join(dir, `${compName}.html`), generateListHtml(resource), { overwrite: true }).saveSync();
    project.createSourceFile(path.join(dir, `${compName}.css`), generateListCss(), { overwrite: true }).saveSync();

    sourceFile.fixMissingImports({}, { importModuleSpecifierPreference: 'relative' });
    sourceFile.formatText();
    sourceFile.saveSync();
}

/**
 * Populates a class for a full data-table list component.
 */
function generateFullListComponent(classDeclaration: ClassDeclaration, resource: Resource): void {
    const listOp = resource.operations.list!;
    const hasPagination = listOp.hasPagination;
    const hasSorting = listOp.hasSorting;
    const hasFilters = (listOp.filterParameters?.length ?? 0) > 0;
    const collectionActions = resource.actions.filter(a => a.level === 'collection');
    const hasCollectionActions = collectionActions.length > 0;

    // --- Properties ---
    const properties: OptionalKind<PropertyDeclarationStructure>[] = [
        { name: 'snackBar', isReadonly: true, scope: 'private', type: 'MatSnackBar', initializer: writer => writer.write('inject(MatSnackBar)') },
        { name: 'svc', isReadonly: true, scope: 'private', type: resource.serviceName, initializer: writer => writer.write(`inject(${resource.serviceName})`) },
        { name: 'data', isReadonly: true, initializer: writer => writer.write(`signal<${resource.modelName}[]>([])`) },
        { name: 'isLoading', isReadonly: true, initializer: writer => writer.write(`signal<boolean>(true)`) },
        { name: 'totalItems', isReadonly: true, initializer: writer => writer.write(`signal<number>(0)`) },
        { name: 'displayedColumns', isReadonly: true, initializer: writer => writer.write(`[${[...resource.listColumns.map(c => `'${c}'`), "'actions'"].join(', ')}]`) }
    ];
    if (hasPagination) properties.push({ name: 'paginator', type: 'MatPaginator', hasExclamationToken: true, decorators: [{ name: 'ViewChild', arguments: ['MatPaginator'] }] });
    if (hasSorting) properties.push({ name: 'sorter', type: 'MatSort', hasExclamationToken: true, decorators: [{ name: 'ViewChild', arguments: ['MatSort'] }] });
    if (hasFilters) properties.push({ name: 'filterForm', isReadonly: true, initializer: writer => writer.write(`new FormGroup({ ${listOp.filterParameters!.map(f => `'${f.name}': new FormControl(null)`).join(', ')} })`) });
    if (hasCollectionActions) properties.push({ name: 'collectionActions', isReadonly: true, initializer: writer => writer.write(`JSON.parse('${JSON.stringify(collectionActions)}')`) });
    classDeclaration.addProperties(properties);

    // --- Methods ---
    const methods: OptionalKind<MethodDeclarationStructure>[] = [];
    if (resource.operations.delete) {
        methods.push({ name: 'delete', parameters: [{ name: 'id', type: resource.operations.delete.idParamType }], statements: writer => writer.write(`if (confirm('Are you sure?')) { this.svc.${resource.operations.delete!.methodName}(id).subscribe(() => { this.triggerLoadData(); this.snackBar.open('${resource.titleName} deleted.', 'OK', { duration: 3000 }); }); }`) });
    }
    if (hasCollectionActions) {
        const cases = collectionActions.map(a => `case '${a.methodName}': this.svc.${a.methodName}().subscribe({ next: () => { this.snackBar.open('Action successful.', 'OK', { duration: 3000 }); this.triggerLoadData(); }, error: (e: unknown) => this.snackBar.open('Action failed.', 'OK', { duration: 5000 }) }); break;`).join('\n');
        methods.push({ name: 'executeCollectionAction', parameters: [{ name: 'action', type: 'any' }], statements: writer => writer.write(`if (!confirm(\`Are you sure you want to run: \${action.label}?\`)) return; switch(action.methodName) { ${cases} default: console.error('Unknown collection action:', action.methodName);}`) });
    }
    if (hasFilters) {
        methods.push({ name: 'resetFilters', statements: writer => writer.write(`this.filterForm.reset();`) });
    }

    const params = hasFilters ? `const params: any = this.filterForm.getRawValue();` : `const params: any = {};`;
    const paginationParams = hasPagination ? `if(this.paginator) { params.page = this.paginator.pageIndex; params.pageSize = this.paginator.pageSize; }` : ``;
    const sortingParams = hasSorting ? `if(this.sorter) { params.sort = this.sorter.active; params.order = this.sorter.direction; }` : ``;
    methods.push({ name: 'loadData', returnType: `Observable<HttpResponse<${resource.modelName}[]>>`, statements: writer => writer.write(`this.isLoading.set(true); ${params} ${paginationParams} ${sortingParams} return this.svc.${listOp.methodName}(params as any, 'response').pipe( finalize(() => this.isLoading.set(false)) );`) });
    methods.push({ name: 'triggerLoadData', statements: writer => writer.write(`this.loadData().subscribe(res => { this.data.set(res.body || []); this.totalItems.set(Number(res.headers.get('X-Total-Count') ?? 0)); });`) });

    const events = [hasSorting ? 'this.sorter.sortChange' : null, hasPagination ? 'this.paginator.page' : null, hasFilters ? 'this.filterForm.valueChanges.pipe(debounceTime(300))' : null].filter((e): e is string => !!e);
    methods.push({ name: 'ngAfterViewInit', statements: writer => writer.write(`merge(${events.join(', ')}).pipe(startWith({})).subscribe(() => this.triggerLoadData());`) });
    classDeclaration.addMethods(methods);
    classDeclaration.addImplements('AfterViewInit');

    // --- Decorator and Imports ---
    const sourceFile = classDeclaration.getSourceFile();
    const imports = new Set<string>(['CommonModule', 'RouterModule', 'MatButtonModule', 'MatIconModule', 'MatProgressSpinnerModule', 'MatTableModule', 'MatTooltipModule']);
    if (hasPagination) imports.add('MatPaginatorModule');
    if (hasSorting) imports.add('MatSortModule');
    if (hasFilters) {
        ['ReactiveFormsModule', 'MatFormFieldModule', 'MatInputModule'].forEach(m => imports.add(m));
        if (listOp.filterParameters!.some(f => f.inputType === 'select')) imports.add('MatSelectModule');
    }
    if (hasCollectionActions) imports.add('MatMenuModule');

    // Add explicit imports for all required modules
    addExplicitImports(sourceFile, Array.from(imports));

    classDeclaration.addDecorator({
        name: 'Component',
        arguments: [writer => writer.write(`{
            selector: 'app-${resource.pluralName}-list',
            standalone: true,
            imports: [${Array.from(imports).join(', ')}],
            templateUrl: './${resource.pluralName}-list.component.html',
            styleUrls: ['./${resource.pluralName}-list.component.css']
        }`)]
    });
}

/**
 * Populates a class for a simple "action shell" list component.
 */
function generateActionShellComponent(classDeclaration: ClassDeclaration, resource: Resource): void {
    const collectionActions = resource.actions.filter(a => a.level === 'collection');
    const hasCollectionActions = collectionActions.length > 0;

    if (hasCollectionActions) {
        classDeclaration.addProperty({ name: 'snackBar', isReadonly: true, scope: 'private', type: 'MatSnackBar', initializer: writer => writer.write('inject(MatSnackBar)') });
        classDeclaration.addProperty({ name: 'svc', isReadonly: true, scope: 'private', type: resource.serviceName, initializer: writer => writer.write(`inject(${resource.serviceName})`) });
        classDeclaration.addProperty({ name: 'collectionActions', isReadonly: true, initializer: writer => writer.write(`JSON.parse('${JSON.stringify(collectionActions)}')`) });
        const cases = collectionActions.map(a => `case '${a.methodName}': this.svc.${a.methodName}().subscribe({ next: () => this.snackBar.open('Action successful.', 'OK', { duration: 3000 }), error: (e: unknown) => this.snackBar.open('Action failed.', 'OK', { duration: 5000 }) }); break;`).join('\n');
        classDeclaration.addMethod({ name: 'executeCollectionAction', parameters: [{ name: 'action', type: 'any' }], statements: writer => writer.write(`if (!confirm(\`Are you sure you want to run: \${action.label}?\`)) return; switch(action.methodName) { ${cases} default: console.error('Unknown collection action:', action.methodName);}`) });
    }

    const imports: string[] = ['CommonModule', 'RouterModule', 'MatButtonModule', 'MatIconModule'];
    if (hasCollectionActions) imports.push('MatMenuModule');

    // Add explicit imports
    addExplicitImports(classDeclaration.getSourceFile(), imports);

    classDeclaration.addDecorator({
        name: 'Component',
        arguments: [writer => writer.write(`{
            selector: 'app-${resource.pluralName}-list',
            standalone: true,
            imports: [${imports.join(', ')}],
            templateUrl: './${resource.pluralName}-list.component.html',
            styleUrls: ['./${resource.pluralName}-list.component.css']
        }`)]
    });
}

function addExplicitImports(sourceFile: any, modules: string[]) {
    // Add core Angular imports that might be needed
    sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/common', namedImports: ['CommonModule'] });
    sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['RouterModule'] });
    if(modules.includes('ReactiveFormsModule')) {
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/forms', namedImports: ['ReactiveFormsModule', 'FormGroup', 'FormControl'] });
    }

    // Add Material module imports
    for (const moduleName of modules) {
        if (MATERIAL_MODULE_MAP[moduleName]) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: MATERIAL_MODULE_MAP[moduleName],
                namedImports: [moduleName]
            });
        }
    }
}

/**
 * Generates the HTML content for the list component's template.
 */
function generateListHtml(resource: Resource): string {
    const listOp = resource.operations.list;
    const idKey = resource.operations.read?.idParamName || resource.operations.delete?.idParamName || 'id';

    const createBtn = resource.operations.create ? `<button mat-flat-button color="primary" [routerLink]="['../new']"><mat-icon>add</mat-icon><span>Create ${resource.titleName}</span></button>` : '';
    const actionsMenu = resource.actions.filter(a => a.level === 'collection').length > 0
        ? `<button mat-flat-button [matMenuTriggerFor]="actionsMenu" color="accent"><mat-icon>more_vert</mat-icon><span>Actions</span></button>
           <mat-menu #actionsMenu="matMenu">
             @for (action of collectionActions; track action.methodName) { <button mat-menu-item (click)="executeCollectionAction(action)"><span>{{ action.label }}</span></button> }
           </mat-menu>` : '';

    const header = `<div class="header-actions"><h2>${plural(resource.titleName)}</h2><div class="header-buttons">${createBtn}${actionsMenu}</div></div>`;

    if (!listOp) {
        return `${header}<div class="no-data-message"><p>This resource does not have a list view. You can create new items or perform collection actions from here.</p></div>`;
    }

    const table = `
    <div class="table-container mat-elevation-z8">
        @if(isLoading()) { <div class="loading-shade"><mat-spinner></mat-spinner></div> }
        <table mat-table [dataSource]="data()" class="mat-table" matSort>
            ${resource.listColumns.map(col => `<ng-container matColumnDef="${col}"><th mat-header-cell *matHeaderCellDef ${listOp.hasSorting ? `mat-sort-header="${col}"` : ''}>${titleCase(col)}</th><td mat-cell *matCellDef="let element">{{element.${col}}}</td></ng-container>`).join("\n")}
            <ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let element" class="actions-cell">
                ${(resource.operations.read || resource.operations.update) ? `<button mat-icon-button [routerLink]="['../', element.${idKey}]" matTooltip="View/Edit ${resource.titleName}"><mat-icon>edit</mat-icon></button>` : ''}
                ${resource.operations.delete ? `<button mat-icon-button color="warn" (click)="delete(element.${idKey})" matTooltip="Delete ${resource.titleName}"><mat-icon>delete</mat-icon></button>` : ''}
            </td></ng-container>
            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
        ${listOp.hasPagination ? `<mat-paginator [length]="totalItems()" [pageSizeOptions]="[5, 10, 25, 100]"></mat-paginator>` : ''}
    </div>`;

    return header + table;
}

/**
 * Generates a standard block of CSS for all list components.
 */
function generateListCss(): string {
    return `:host { display: block; padding: 2rem; } .header-actions { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; } .header-buttons { display: flex; gap: 0.5rem; } .table-container { position: relative; } .loading-shade { position: absolute; top: 0; left: 0; bottom: 56px; right: 0; background: rgba(0, 0, 0, 0.15); z-index: 100; display: flex; align-items: center; justify-content: center; } .actions-cell { width: 120px; text-align: right; } .no-data-message { padding: 2rem; text-align: center; color: #888; }`;
}
