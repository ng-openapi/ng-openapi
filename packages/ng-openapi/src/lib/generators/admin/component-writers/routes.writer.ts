import * as path from 'path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { Resource } from '../admin.types';
import { plural } from '../admin.helpers';
import { pascalCase } from "@ng-openapi/shared";

function createRouteObject(path: string, title: string, componentImportPath: string, componentName: string): string {
    return `{ path: '${path}', title: '${title}', loadComponent: () => import('${componentImportPath}').then(m => m.${componentName}) }`;
}

export function writeResourceRoutes(resource: Resource, project: Project, adminDir: string) {
    const dir = path.join(adminDir, resource.pluralName);
    const filePath = path.join(dir, `${resource.pluralName}.routes.ts`);
    const sourceFile = project.createSourceFile(filePath, "", { overwrite: true });

    sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Routes'] });

    const routes: string[] = [];
    if (resource.operations.list) {
        routes.push(createRouteObject('', plural(resource.titleName), `./${resource.pluralName}-list/${resource.pluralName}-list.component`, `${pascalCase(resource.pluralName)}ListComponent`));
    } else if (resource.operations.create) {
        routes.push(`{ path: '', redirectTo: 'new', pathMatch: 'full' }`);
    }

    if (resource.operations.create) {
        routes.push(createRouteObject('new', `Create ${resource.titleName}`, `./${resource.name}-form/${resource.name}-form.component`, `${pascalCase(resource.name)}FormComponent`));
    }

    if (resource.operations.read || resource.operations.update || resource.actions.some(a => a.level === 'item')) {
        const idParam = resource.operations.read?.idParamName || resource.operations.update?.idParamName || 'id';
        routes.push(createRouteObject(`:${idParam}`, `${resource.isEditable ? 'Edit' : 'View'} ${resource.titleName}`, `./${resource.name}-form/${resource.name}-form.component`, `${pascalCase(resource.name)}FormComponent`));
    }

    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [{
            name: `${resource.pluralName.toUpperCase()}_ROUTES`,
            type: 'Routes',
            initializer: `[${routes.join(',\n')}]`
        }]
    });

    sourceFile.formatText();
    sourceFile.saveSync();
}

export function writeMasterAdminRoutes(resources: Resource[], project: Project, adminRootDir: string) {
    const filePath = path.join(adminRootDir, "admin.routes.ts");
    const sourceFile = project.createSourceFile(filePath, "", { overwrite: true });

    sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/router', namedImports: ['Routes'] });

    const routeObjects: string[] = [];
    if (resources.length > 0) {
        routeObjects.push(`{ path: '', redirectTo: '${resources[0].pluralName}', pathMatch: 'full' }`);
    }
    resources.forEach(resource => {
        routeObjects.push(`{ path: '${resource.pluralName}', loadChildren: () => import('./${resource.pluralName}/${resource.pluralName}.routes').then(m => m.${resource.pluralName.toUpperCase()}_ROUTES) }`);
    });

    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [{
            name: 'ADMIN_ROUTES',
            type: 'Routes',
            initializer: `[${routeObjects.join(',\n')}]`
        }]
    });

    sourceFile.formatText();
    sourceFile.saveSync();
}
