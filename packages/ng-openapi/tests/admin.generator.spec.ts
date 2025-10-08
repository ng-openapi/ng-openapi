import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import { Project } from "ts-morph";
import { AdminGenerator } from "../src/lib/generators/admin/admin.generator";
import * as fs from 'fs';
import * as path from 'path';

// --- MOCKS ---
const originalFs = require('fs');
vi.mock('fs');

// A single, comprehensive spec to cover all test cases
const fullTestSpec = {
    openapi: '3.0.0',
    info: { title: 'Full Test API', version: '1.0.0' },
    paths: {
        // Full CRUD Resource for general testing
        '/users': {
            get: { tags: ['Users'], operationId: 'listUsers', responses: { '200': { description: 'OK' } } },
            post: { tags: ['Users'], operationId: 'createUser', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUser' } } } } }
        },
        '/users/{userId}': {
            get: { tags: ['Users'], operationId: 'getUser', parameters: [{ name: 'userId', in: 'path' }] },
            put: { tags: ['Users'], operationId: 'updateUser', parameters: [{ name: 'userId', in: 'path' }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUser' } } } } },
            delete: { tags: ['Users'], operationId: 'deleteUser', parameters: [{ name: 'userId', in: 'path' }] }
        },
        // Resource with varied data types for UI component testing
        '/products': {
            get: { tags: ['Products'], responses: { '200': { description: 'OK' } } },
            post: { tags: ['Products'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProduct' } } } } }
        },
        '/products/{id}': {
            get: { tags: ['Products'], parameters: [{ name: 'id', in: 'path' }] },
        },
        // Resource missing Update and Delete operations
        '/posts': {
            get: { tags: ['Posts'], responses: { '200': { description: 'OK' } } },
            post: { tags: ['Posts'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePost' } } } } }
        },
        '/posts/{postId}': { get: { tags: ['Posts'], parameters: [{ name: 'postId', in: 'path' }] } },
        // --- Invalid or Incomplete Resources (should be ignored) ---
        '/audits': { // Missing POST
            get: { tags: ['Audits'], responses: { '200': { description: 'OK' } } }
        },
        '/feedback': { // Missing GET
            post: { tags: ['Feedback'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateFeedback' } } } } }
        },
        '/internal_reports': { // Tag with underscore
            get: { tags: ['internal_reports'], responses: { '200': { description: 'OK' } } },
            post: { tags: ['internal_reports'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReport' } } } } }
        }
    },
    components: {
        schemas: {
            CreateUser: { type: 'object', properties: { username: { type: 'string' } } },
            CreatePost: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
            CreateProduct: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', description: 'Product name' },
                    price: { type: 'number', description: 'Cost of the product' },
                    quantity: { type: 'integer', description: 'Items in stock' },
                    isEnabled: { type: 'boolean', description: 'Product status' },
                    lastChecked: { type: 'string', format: 'date-time', description: 'Last health check' },
                    purchaseDate: { type: 'string', format: 'date', description: 'Date of purchase' },
                }
            },
            CreateFeedback: { type: 'object', properties: { comment: { type: 'string' } } },
            CreateReport: { type: 'object', properties: { data: { type: 'string' } } }
        }
    }
};

// --- TEST SUITE ---
describe('AdminGenerator', () => {
    async function setupGenerator(spec: any, proj: Project) {
        const config: GeneratorConfig = { input: 'mock-spec.json', output: '/output', options: { admin: true } };
        vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
            if (p.toString().endsWith('mock-spec.json')) return JSON.stringify(spec);
            if (p.toString().includes('.template')) {
                const templateName = path.basename(p);
                const actualPath = path.resolve(__dirname, `../src/lib/generators/admin/templates/${templateName}`);
                return originalFs.readFileSync(actualPath, 'utf8');
            }
            return '';
        });
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        const parser = await SwaggerParser.create(config.input, config);
        return new AdminGenerator(parser, proj, config);
    }

    afterEach(() => { vi.restoreAllMocks(); });

    describe('Resource Collection', () => {
        let project: Project;
        let generator: AdminGenerator;

        beforeEach(async () => {
            project = new Project({ useInMemoryFileSystem: true });
            generator = await setupGenerator(fullTestSpec, project);
        });

        it('should identify all viable resources with GET/POST operations', () => {
            const resources = generator.collectResources();
            expect(resources.length).toBe(3);
            expect(resources.map(r => r.name)).toEqual(expect.arrayContaining(['user', 'product', 'post']));
        });

        it('should ignore resources missing required operations or with invalid tags', () => {
            const resources = generator.collectResources();
            const resourceNames = resources.map(r => r.name);

            expect(resourceNames).not.toContain('audit');
            expect(resourceNames).not.toContain('feedback');
            expect(resourceNames).not.toContain('internal_report');
        });
    });

    describe('File Generation & Conditional Logic', () => {
        let project: Project;

        beforeEach(async () => {
            project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(fullTestSpec, project);
            await generator.generate('/output');
        });

        it('should create all required files for a full CRUD resource', () => {
            const expectedFiles = [
                '/output/admin/users/users-list/users-list.component.ts',
                '/output/admin/users/user-form/user-form.component.ts',
                '/output/admin/users/users.routes.ts',
            ];
            for (const file of expectedFiles) {
                expect(project.getSourceFile(file), `File not found: ${file}`).toBeDefined();
            }
        });

        describe('List Component', () => {
            it('should generate all action buttons and methods for a full CRUD resource', () => {
                const userListHtml = project.getSourceFileOrThrow('/output/admin/users/users-list/users-list.component.html').getFullText();
                const userListTs = project.getSourceFileOrThrow('/output/admin/users/users-list/users-list.component.ts').getFullText();

                expect(userListHtml).toContain(`[routerLink]="[element.userId, 'edit']"`);
                expect(userListHtml).toContain(`(click)="delete(element.userId)"`);
                expect(userListTs).toContain('delete(id:');
            });

            it('should NOT generate edit/delete buttons or methods for resource lacking those operations', () => {
                const postListHtml = project.getSourceFileOrThrow('/output/admin/posts/posts-list/posts-list.component.html').getFullText();
                const postListTs = project.getSourceFileOrThrow('/output/admin/posts/posts-list/posts-list.component.ts').getFullText();

                expect(postListHtml).not.toContain(`'edit'`);
                expect(postListHtml).not.toContain(`(click)="delete`);
                expect(postListTs).not.toContain('delete(id:');
            });
        });

        describe('Routes File', () => {
            it('should generate all routes for a full CRUD resource', async () => {
                const userRoutesTs = project.getSourceFileOrThrow('/output/admin/users/users.routes.ts').getFullText();

                expect(userRoutesTs).toContain(`path: ''`); // List route
                expect(userRoutesTs).toContain(`path: 'new'`); // Create route
                expect(userRoutesTs).toContain(`path: ':userId/edit'`); // Edit route
            });

            it('should generate limited routes for a resource with missing operations', async () => {
                const postRoutesTs = project.getSourceFileOrThrow('/output/admin/posts/posts.routes.ts').getFullText();

                expect(postRoutesTs).toContain(`path: ''`); // List route
                expect(postRoutesTs).toContain(`path: 'new'`); // Create route
                expect(postRoutesTs).not.toContain(`/edit'`); // Should NOT have edit route
            });
        });
    });

    describe('UI Component Generation (Form Fields)', () => {
        let project: Project;
        let formComponentHtml: string;
        let formComponentTs: string;

        beforeEach(async () => {
            project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(fullTestSpec, project);
            await generator.generate('/output');

            formComponentHtml = project.getSourceFileOrThrow('/output/admin/products/product-form/product-form.component.html').getFullText();
            formComponentTs = project.getSourceFileOrThrow('/output/admin/products/product-form/product-form.component.ts').getFullText();
        });

        it('should generate a mat-input[type=text] for a standard string property', () => {
            expect(formComponentHtml).toContain('<mat-label>Name</mat-label>');
            expect(formComponentHtml).toContain('<input matInput formControlName="name" type="text">');
            expect(formComponentTs).toContain(`'name': [null as any, [Validators.required]]`);
        });

        it('should generate a mat-input[type=number] for integer and number properties', () => {
            expect(formComponentHtml).toContain('<mat-label>Price</mat-label>');
            expect(formComponentHtml).toContain('<input matInput formControlName="price" type="number">');
            expect(formComponentTs).toContain(`'price': [null as any, []]`);

            expect(formComponentHtml).toContain('<mat-label>Quantity</mat-label>');
            expect(formComponentHtml).toContain('<input matInput formControlName="quantity" type="number">');
            expect(formComponentTs).toContain(`'quantity': [null as any, []]`);
        });

        it('should generate a mat-checkbox for a boolean property', () => {
            expect(formComponentHtml).toContain('<mat-checkbox formControlName="isEnabled">Is Enabled</mat-checkbox>');
            expect(formComponentTs).toContain(`'isEnabled': [false as any, []]`);
        });

        it('should generate a mat-input[type=datetime-local] for a string with "date-time" format', () => {
            expect(formComponentHtml).toContain('<mat-label>Last Checked</mat-label>');
            expect(formComponentHtml).toContain('<input matInput formControlName="lastChecked" type="datetime-local">');
        });

        it('should generate a mat-input[type=date] for a string with "date" format', () => {
            expect(formComponentHtml).toContain('<mat-label>Purchase Date</mat-label>');
            expect(formComponentHtml).toContain('<input matInput formControlName="purchaseDate" type="date">');
        });

        it('should import all required Angular Material modules in the form component', () => {
            expect(formComponentTs).toContain(`import { MatFormFieldModule } from '@angular/material/form-field'`);
            expect(formComponentTs).toContain(`import { MatInputModule } from '@angular/material/input'`);
            expect(formComponentTs).toContain(`import { MatButtonModule } from '@angular/material/button'`);
            expect(formComponentTs).toContain(`import { MatCheckboxModule } from '@angular/material/checkbox'`);
        });
    });
});
