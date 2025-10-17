import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph';
import { generateFromConfig } from '../../src/lib/core/generator';
import { fullE2ESpec } from './specs/test.specs';
import { GeneratorConfig } from '@ng-openapi/shared';

describe('Integration: End-to-End Generation', () => {
    let project: Project;

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: 'spec.json',
            output: '/output',
            options: {
                generateServices: true,
                admin: true,
                dateType: 'string',
                enumStyle: 'enum'
            }
        };
        project.createSourceFile(config.input, fullE2ESpec);
        await generateFromConfig(config, project);
    }, 30000);

    describe('Full Resource Generation (Books)', () => {
        let listComponent: SourceFile;
        let formComponent: SourceFile;
        let listClass: ClassDeclaration;
        let formClass: ClassDeclaration;

        beforeAll(() => {
            listComponent = project.getSourceFileOrThrow('/output/admin/books/books-list/books-list.component.ts');
            formComponent = project.getSourceFileOrThrow('/output/admin/books/book-form/book-form.component.ts');
            listClass = listComponent.getClassOrThrow('BooksListComponent');
            formClass = formComponent.getClassOrThrow('BookFormComponent');
        });

        it('list component should have correct imports and class structure', () => {
            const serviceImport = listComponent.getImportDeclaration(imp => {
                return !!imp.getNamedImports().find(ni => ni.getName() === 'BooksService');
            });
            expect(serviceImport, "The import for BooksService should exist").toBeDefined();
            expect(serviceImport!.getModuleSpecifierValue()).toContain('services');

            const svcProp = listClass.getProperty('svc');
            expect(svcProp, "'svc' property should be defined").toBeDefined();
            expect(svcProp!.getType().getText(svcProp)).toBe('BooksService');
        });

        it('list component should have correctly generated delete method', () => {
            const deleteMethod = listClass.getMethod('delete');
            expect(deleteMethod).toBeDefined();
            const body = deleteMethod!.getBodyText();
            // The programmatic writer is smart enough to not add a cast if the type matches.
            expect(body).toContain('this.svc.booksidDELETE(id)');
        });

        it('form component should have correct imports and class structure', () => {
            const decorator = formClass.getDecorator('Component')!;
            const decoratorArgText = decorator.getArguments()[0].getText();
            expect(decoratorArgText).toContain('ReactiveFormsModule');

            const svcProp = formClass.getProperty('svc');
            expect(svcProp, "Service property 'svc' should exist").toBeDefined();
            expect(svcProp!.getType().getText(svcProp)).toBe('BooksService');
        });

        it('form component should call getById with correct casting in its effect', () => {
            const effect = formClass.getProperty('formEffect');
            const effectBody = effect!.getInitializer()!.getText();
            expect(effectBody).toContain('this.svc.booksidGET(id as number)');
        });

        it('form component should handle onSubmit with create and update calls correctly', () => {
            const onSubmitMethod = formClass.getMethod('onSubmit');
            const body = onSubmitMethod!.getBodyText();
            expect(body).toContain("this.svc.booksidPUT(this.id() as number, formValue)");
            expect(body).toContain("this.svc.booksPOST(formValue)");
        });

        it('routing module should have correct paths', () => {
            const routesTs = project.getSourceFileOrThrow('/output/admin/books/books.routes.ts').getFullText();
            expect(routesTs).toContain(`path: '', title: 'Books'`);
            expect(routesTs).toContain(`path: 'new', title: 'Create Book'`);
            expect(routesTs).toContain(`path: ':id', title: 'Edit Book'`);
        });
    });

    describe('Master Routing and Edge Cases', () => {
        it('should generate master admin routes with a default redirect', () => {
            const masterRoutes = project.getSourceFileOrThrow('/output/admin/admin.routes.ts').getFullText();
            expect(masterRoutes).toContain(`path: 'books',`);
            expect(masterRoutes).toContain(`path: '', redirectTo: 'books', pathMatch: 'full'`);
        });

        it('should generate create-only routes correctly (Publishers)', () => {
            const routes = project.getSourceFileOrThrow('/output/admin/publishers/publishers.routes.ts').getFullText();
            expect(routes).toContain(`path: '', redirectTo: 'new', pathMatch: 'full'`);
            expect(routes).toContain(`path: 'new', title: 'Create Publisher'`);
            expect(routes).not.toContain(`path: ':id'`);
        });
    });

    describe('Actions and Read-Only Views', () => {
        it('should generate correct service calls for collection and item actions (Servers)', () => {
            const listComponent = project.getSourceFileOrThrow('/output/admin/servers/servers-list/servers-list.component.ts');
            const formComponent = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.ts');
            const listActionMethod = listComponent.getClassOrThrow('ServersListComponent').getMethodOrThrow('executeCollectionAction');
            expect(listActionMethod.getBodyText()).toContain("case 'reindexAll': this.svc.reindexAll(");
            const formActionMethod = formComponent.getClassOrThrow('ServerFormComponent').getMethodOrThrow('onAction');
            expect(formActionMethod.getBodyText()).toContain("this.svc.rebootServer(id as");
        });

        it('should generate a read-only view for Logs', () => {
            const formHtml = project.getSourceFileOrThrow('/output/admin/logs/log-form/log-form.component.html').getFullText();
            const formTs = project.getSourceFileOrThrow('/output/admin/logs/log-form/log-form.component.ts').getClassOrThrow('LogFormComponent');
            expect(formHtml).toContain('<dl class="details-list">');
            expect(formHtml).not.toContain('<form');
        });
    });
});
