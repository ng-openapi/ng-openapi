// packages/ng-openapi/src/lib/generators/admin/component-writers/routes.writer.ts

import * as path from 'path';
import { Project } from 'ts-morph';
import { Resource } from '../admin.types';
import { plural } from '../admin.helpers';

export function writeResourceRoutes(resource: Resource, project: Project, adminDir: string) {
    const dir = path.join(adminDir, resource.pluralName);
    const filePath = path.join(dir, `${resource.pluralName}.routes.ts`);
    const sourceFile = project.createSourceFile(filePath, "", { overwrite: true });

    const routesName = `${resource.pluralName.toUpperCase()}_ROUTES`;
    const routeEntries = [];
    const hasItemView = resource.operations.read || resource.operations.update || resource.actions.some(a => a.level === 'item');

    // ===== THE FIX IS HERE =====
    // This logic correctly separates the concerns.
    if (resource.operations.list) {
        // If a list operation exists, the base path goes to the list component.
        routeEntries.push(`{ path: '', title: '${plural(resource.titleName)}', loadComponent: () => import('./${resource.pluralName}-list/${resource.pluralName}-list.component').then(m => m.${resource.className}ListComponent) }`);
    } else if (resource.operations.create) {
        // If NO list operation exists, but a create operation does, the base path REDIRECTS to the new form.
        routeEntries.push(`{ path: '', redirectTo: 'new', pathMatch: 'full' }`);
    }

    if (resource.operations.create) {
        // The 'new' path is always added if a create operation exists.
        routeEntries.push(`{ path: 'new', title: 'Create ${resource.titleName}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`);
    }

    if (hasItemView) {
        const idParam = resource.operations.read?.idParamName || resource.operations.update?.idParamName || 'id';
        const routeTitle = resource.isEditable ? `Edit ${resource.titleName}` : `View ${resource.titleName}`;
        routeEntries.push(`{ path: ':${idParam}', title: '${routeTitle}', loadComponent: () => import('./${resource.name}-form/${resource.name}-form.component').then(m => m.${resource.className}FormComponent) }`);
    }

    sourceFile.addStatements(`/* eslint-disable */
import { Routes } from '@angular/router';
export const ${routesName}: Routes = [ ${routeEntries.join(",\n")} ];`);
    sourceFile.formatText();
    sourceFile.saveSync();
}

export function writeMasterAdminRoutes(resources: Resource[], project: Project, adminRootDir: string) {
    const filePath = path.join(adminRootDir, "admin.routes.ts");
    const sourceFile = project.createSourceFile(filePath, "", { overwrite: true });

    console.log("[ADMIN] Generating master admin routes file...");

    const routeObjects = resources.map(resource => {
        const routesConstantName = `${resource.pluralName.toUpperCase()}_ROUTES`;
        return `{
    path: '${resource.pluralName}',
    loadChildren: () => import('./${resource.pluralName}/${resource.pluralName}.routes').then(m => m.${routesConstantName})
}`;
    });

    if (resources.length > 0) {
         routeObjects.unshift(`{ path: '', redirectTo: '${resources[0].pluralName}', pathMatch: 'full' }`);
    }

    sourceFile.addStatements(`/* eslint-disable */
import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
    ${routeObjects.join(',\n    ')}
];
`);
    sourceFile.formatText();
    sourceFile.saveSync();
    console.log(`[ADMIN] Master admin routes file created at ${filePath}`);
}