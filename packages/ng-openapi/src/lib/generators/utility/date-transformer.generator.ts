import {Project} from 'ts-morph';
import * as path from 'path';

export class DateTransformerGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'date-transformer.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', {overwrite: true});

        sourceFile.addImportDeclaration({
            namedImports: ['HttpInterceptor', 'HttpRequest', 'HttpHandler', 'HttpEvent', 'HttpResponse'],
            moduleSpecifier: '@angular/common/http',
        });

        sourceFile.addImportDeclaration({
            namedImports: ['Injectable'],
            moduleSpecifier: '@angular/core',
        });

        sourceFile.addImportDeclaration({
            namedImports: ['Observable'],
            moduleSpecifier: 'rxjs',
        });

        sourceFile.addImportDeclaration({
            namedImports: ['map'],
            moduleSpecifier: 'rxjs/operators',
        });

        // Add ISO date regex constant
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: 'const' as any,
            declarations: [{
                name: 'ISO_DATE_REGEX',
                initializer: '/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z?$/'
            }]
        });

        // Add transformer function
        sourceFile.addFunction({
            name: 'transformDates',
            isExported: true,
            parameters: [
                {name: 'obj', type: 'any'}
            ],
            returnType: 'any',
            statements: `
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => transformDates(item));
    }

    if (typeof obj === 'object') {
        const transformed: any = {};
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
                transformed[key] = new Date(value);
            } else {
                transformed[key] = transformDates(value);
            }
        }
        return transformed;
    }

    return obj;`
        });

        // Add interceptor class
        sourceFile.addClass({
            name: 'DateInterceptor',
            isExported: true,
            decorators: [{
                name: 'Injectable',
                arguments: []
            }],
            implements: ['HttpInterceptor'],
            methods: [{
                name: 'intercept',
                parameters: [
                    {name: 'req', type: 'HttpRequest<any>'},
                    {name: 'next', type: 'HttpHandler'}
                ],
                returnType: 'Observable<HttpEvent<any>>',
                statements: `
    return next.handle(req).pipe(
        map(event => {
            if (event instanceof HttpResponse && event.body) {
                return event.clone({ body: transformDates(event.body) });
            }
            return event;
        })
    );`
            }]
        });

        sourceFile.saveSync();
    }
}