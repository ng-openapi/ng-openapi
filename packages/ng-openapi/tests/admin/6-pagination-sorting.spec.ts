import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { SwaggerParser } from '@ng-openapi/shared';
import { paginationAndSortSpec } from './specs/test.specs';

describe('Integration: Pagination and Sorting Generation', () => {
    let project: Project;
    let listHtml: string;
    let listTs: string;

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: {} } } as any;
        const parser = new SwaggerParser(JSON.parse(paginationAndSortSpec), config);
        const generator = new AdminGenerator(parser, project, config);
        await generator.generate('/output');

        listHtml = project.getSourceFileOrThrow('/output/admin/items/items-list/items-list.component.html').getFullText();
        listTs = project.getSourceFileOrThrow('/output/admin/items/items-list/items-list.component.ts').getFullText();
    });

    it('should add MatPaginator and MatSort modules to component imports', () => {
        // Correctly import MatPaginatorModule and MatSortModule
        expect(listTs).toContain("import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';");
        expect(listTs).toContain("import { MatSort, MatSortModule } from '@angular/material/sort';");

        // Find the @Component decorator and check its imports array.
        const componentDecorator = project
            .getSourceFileOrThrow('/output/admin/items/items-list/items-list.component.ts')
            .getClassOrThrow('ItemListComponent')
            .getDecorator('Component')!;

        const importsText = componentDecorator.getArguments()[0].getProperty('imports')?.getInitializer()?.getText() ?? '';

        // Check for the presence of each module individually, ignoring order.
        expect(importsText).toContain('CommonModule');
        expect(importsText).toContain('RouterModule');
        expect(importsText).toContain('MatTableModule');
        expect(importsText).toContain('MatPaginatorModule');
        expect(importsText).toContain('MatSortModule');
        expect(importsText).toContain('MatProgressSpinnerModule');
        expect(importsText).toContain('ReactiveFormsModule');
    });

    it('should generate mat-paginator and matSort directive in the HTML', () => {
        expect(listHtml).toContain('<mat-paginator');
        expect(listHtml).toContain('matSort');
        expect(listHtml).toContain('<th mat-header-cell *matHeaderCellDef mat-sort-header="name">');
    });

    it('should generate @ViewChild properties for the paginator and sorter', () => {
        expect(listTs).toContain('@ViewChild(MatPaginator) paginator!: MatPaginator;');
        expect(listTs).toContain('@ViewChild(MatSort) sorter!: MatSort;');
    });

    it('should implement ngAfterViewInit with merge logic to handle events', () => {
        expect(listTs).toContain('ngAfterViewInit(): void {');
        expect(listTs).toContain("merge(...events).pipe(");
        expect(listTs).toContain("startWith({}),");
        expect(listTs).toContain("switchMap(() => this.loadData()),");
    });

    it('should update loadData to pass pagination and sorting params to the service', () => {
        const loadDataMethod = project.getSourceFileOrThrow('/output/admin/items/items-list/items-list.component.ts')
            .getClassOrThrow('ItemListComponent')
            .getMethodOrThrow('loadData');
        const bodyText = loadDataMethod.getBodyText();

        expect(bodyText).toContain('this.isLoading.set(true);');
        expect(bodyText).toContain("const params: any = this.filterForm.getRawValue();");
        expect(bodyText).toContain("params.page = this.paginator.pageIndex;");
        expect(bodyText).toContain("params.pageSize = this.paginator.pageSize;");
        expect(bodyText).toContain("params.sort = this.sorter.active;");
        expect(bodyText).toContain("params.order = this.sorter.direction;");
        expect(bodyText).toContain("return this.svc.listItems(params as any, 'response').pipe(");
    });

    it('should parse the X-Total-Count header from the response', () => {
        const loadDataMethod = project.getSourceFileOrThrow('/output/admin/items/items-list/items-list.component.ts')
            .getClassOrThrow('ItemListComponent')
            .getMethodOrThrow('loadData');
        const bodyText = loadDataMethod.getBodyText();

        expect(bodyText).toContain("this.totalItems.set(Number(res.headers.get('X-Total-Count') ?? 0));");
    });
});
