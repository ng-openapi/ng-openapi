import { describe, it, expect, beforeAll } from 'vitest';
import { Project, SourceFile, ClassDeclaration } from 'ts-morph'; // Import ts-morph classes
import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { SwaggerParser } from '@ng-openapi/shared';
import { paginationAndSortSpec } from './specs/test.specs';

describe('Integration: Pagination and Sorting Generation', () => {
    let project: Project;
    let listHtml: string;
    let listComponentFile: SourceFile; // Use SourceFile object
    let listComponentClass: ClassDeclaration; // Use ClassDeclaration object

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: {} } } as any;
        const parser = new SwaggerParser(JSON.parse(paginationAndSortSpec), config);
        const generator = new AdminGenerator(parser, project, config);
        await generator.generate('/output');

        listHtml = project.getSourceFileOrThrow('/output/admin/items/items-list/items-list.component.html').getFullText();
        listComponentFile = project.getSourceFileOrThrow('/output/admin/items/items-list/items-list.component.ts');
        listComponentClass = listComponentFile.getClassOrThrow('ItemsListComponent');
    });

    it('should add MatPaginator and MatSort modules to component imports', () => {
        const componentDecorator = listComponentClass.getDecorator('Component')!;
        const importsText = componentDecorator.getArguments()[0].getText();

        expect(importsText).toContain('MatPaginatorModule');
        expect(importsText).toContain('MatSortModule');
    });

    it('should generate mat-paginator and matSort directive in the HTML', () => {
        expect(listHtml).toContain('<mat-paginator');
        expect(listHtml).toContain('matSort');
        expect(listHtml).toContain('<th mat-header-cell *matHeaderCellDef mat-sort-header="name">');
    });

    it('should generate @ViewChild properties for the paginator and sorter', () => {
        const paginatorProp = listComponentClass.getProperty('paginator');
        const sorterProp = listComponentClass.getProperty('sorter');

        expect(paginatorProp).toBeDefined();
        expect(sorterProp).toBeDefined();

        expect(paginatorProp!.getDecorator('ViewChild')).toBeDefined();
        expect(sorterProp!.getDecorator('ViewChild')).toBeDefined();
    });

    it('should implement ngAfterViewInit with merge logic to handle events', () => {
        const method = listComponentClass.getMethodOrThrow('ngAfterViewInit');
        const bodyText = method.getBodyText();

        expect(bodyText).toContain("merge(");
        expect(bodyText).toContain("this.sorter.sortChange");
        expect(bodyText).toContain("this.paginator.page");
        expect(bodyText).toContain("startWith({})");
        expect(bodyText).toContain("this.triggerLoadData()");
    });

    it('should update loadData to pass pagination and sorting params to the service', () => {
        const method = listComponentClass.getMethodOrThrow('loadData');
        const bodyText = method.getBodyText();

        expect(bodyText).toContain("params.page = this.paginator.pageIndex;");
        expect(bodyText).toContain("params.pageSize = this.paginator.pageSize;");
        expect(bodyText).toContain("params.sort = this.sorter.active;");
        expect(bodyText).toContain("params.order = this.sorter.direction;");
        expect(bodyText).toContain("return this.svc.listItems(params as any, 'response')");
    });

    it('should parse the X-Total-Count header from the response', () => {
        const method = listComponentClass.getMethodOrThrow('triggerLoadData');
        const bodyText = method.getBodyText();

        expect(bodyText).toContain("this.totalItems.set(Number(res.headers.get('X-Total-Count') ?? 0));");
    });
});
