import { describe, it, expect, beforeAll } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@ng-openapi/shared';

import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { fullE2ESpec } from './specs/test.specs';

describe('Integration: End-to-End Generation', () => {
    let project: Project;

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: {} } } as any;
        // The parser needs a JavaScript object, not a JSON string.
        const parser = new SwaggerParser(JSON.parse(fullE2ESpec), config);
        const generator = new AdminGenerator(parser, project, config);
        await generator.generate('/output');
    });

    describe('Full Resource Generation', () => {
        it('list component should have correct imports and methods', () => {
            const listTs = project.getSourceFileOrThrow('/output/admin/books/books-list/books-list.component.ts').getFullText();
            expect(listTs).toContain(`import { BooksService } from '../../../services';`);
            expect(listTs).toContain('delete(id: number | string): void');
        });

        it('form component should handle relationships and feedback', () => {
            const formTs = project.getSourceFileOrThrow('/output/admin/books/book-form/book-form.component.ts').getFullText();
            expect(formTs).toContain('private readonly authorSvc = inject(AuthorsService);');
            expect(formTs).toContain('this.snackBar.open(');
        });

        it('routing module should have correct paths', () => {
            const routesTs = project.getSourceFileOrThrow('/output/admin/books/books.routes.ts').getFullText();
            expect(routesTs).toContain(`path: '', title: 'Books'`);
        });
    });

    describe('Master Routing and Edge Cases', () => {
        it('should generate master admin routes with a default redirect', () => {
            const masterRoutes = project.getSourceFileOrThrow('/output/admin/admin.routes.ts').getFullText();
            expect(masterRoutes).toContain(`path: 'books',`);
            expect(masterRoutes).toContain(`path: '', redirectTo: 'books', pathMatch: 'full'`);
        });

        it('should generate create-only routes correctly', () => {
            const routes = project.getSourceFileOrThrow('/output/admin/publishers/publishers.routes.ts').getFullText();
            expect(routes).toContain(`path: '', redirectTo: 'new', pathMatch: 'full'`);
        });
    });

    describe('Actions and Read-Only Views', () => {
        it('should generate collection and item actions', () => {
            const listTs = project.getSourceFileOrThrow('/output/admin/servers/servers-list/servers-list.component.ts').getFullText();
            const formTs = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.ts').getFullText();
            expect(listTs).toContain(`case 'reindexAll':`);
            expect(formTs).toContain(`case 'rebootServer':`);
        });

        it('should generate a read-only view', () => {
            const formHtml = project.getSourceFileOrThrow('/output/admin/logs/log-form/log-form.component.html').getFullText();
            const formTs = project.getSourceFileOrThrow('/output/admin/logs/log-form/log-form.component.ts').getFullText();
            expect(formHtml).toContain('<dl class="details-list">');
            expect(formTs).toContain('readonly isEditable = false;');
        });
    });
});
