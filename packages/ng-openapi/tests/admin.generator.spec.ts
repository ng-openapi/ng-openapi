import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import { Project } from "ts-morph";
import { AdminGenerator } from "../src/lib/generators/admin/admin.generator";
import * as fs from 'fs';
import * as path from 'path';

// This tells Vitest to intercept any import of the 'fs' module.
vi.mock('fs');

// Mock OpenAPI document for testing
const mockSpec: any = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
        '/users': {
            get: { tags: ['Users'], operationId: 'listUsers', responses: { '200': { description: 'OK' } } },
            post: { tags: ['Users'], operationId: 'createUser', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { '201': { description: 'Created' } } }
        },
        '/users/{userId}': {
            get: { tags: ['Users'], operationId: 'getUserById', parameters: [{ name: 'userId', in: 'path', required: true }], responses: { '200': { description: 'OK' } } },
            put: { tags: ['Users'], operationId: 'updateUser', parameters: [{ name: 'userId', in: 'path', required: true }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { '200': { description: 'OK' } } },
            delete: { tags: ['Users'], operationId: 'deleteUser', parameters: [{ name: 'userId', in: 'path', required: true }], responses: { '204': { description: 'No Content' } } }
        }
    },
    components: {
        schemas: {
            User: {
                type: 'object',
                required: ['username'],
                properties: {
                    id: { type: 'integer', readOnly: true },
                    username: { type: 'string', minLength: 3 },
                    isAdmin: { type: 'boolean' }
                }
            }
        }
    }
};

describe('AdminGenerator', () => {
    let parser: SwaggerParser;
    let project: Project;
    let config: GeneratorConfig;

    beforeEach(async () => {
        // Import the real 'fs' module to read our template files
        const originalFs = await vi.importActual<typeof fs>('fs');

        // Create a smarter mock for readFileSync
        vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, options?: any) => {
            // If the parser asks for the spec file, return the mock JSON
            if (p === 'mock-spec.json') {
                return JSON.stringify(mockSpec);
            }
            // Add 'utf8' encoding to ensure readFileSync returns a string, not a Buffer
            if (p.includes('list.component.html.template')) {
                return originalFs.readFileSync(path.resolve(__dirname, '../src/lib/generators/admin/templates/list.component.html.template'), 'utf8');
            }
            if (p.includes('form.component.html.template')) {
                return originalFs.readFileSync(path.resolve(__dirname, '../src/lib/generators/admin/templates/form.component.html.template'), 'utf8');
            }
            // Fallback for any other call
            return '';
        });

        vi.spyOn(fs, 'existsSync').mockReturnValue(true);

        config = { input: 'mock-spec.json', output: '', options: {} };
        parser = await SwaggerParser.create(config.input, config);
        project = new Project({ useInMemoryFileSystem: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('collectResources', () => {
        it('should correctly identify a full CRUD resource', () => {
            const generator = new AdminGenerator(parser, project, config);
            const resources = generator.collectResources();

            expect(resources.length).toBe(1);
            const userResource = resources[0];

            expect(userResource.name).toBe('user');
            expect(userResource.className).toBe('User');

            expect(userResource.operations.list?.methodName).toBe('listUsers');
        });

        it('should generate correct form properties from schema', () => {
            const generator = new AdminGenerator(parser, project, config);
            const formProps = generator.collectResources()[0].formProperties;

            expect(formProps.length).toBe(2);
            const usernameProp = formProps.find(p => p.name === 'username')!;
            expect(usernameProp.validators).toContain('Validators.minLength(3)');
        });
    });

    describe('generate', () => {
        it('should create all required files for a resource', async () => {
            const generator = new AdminGenerator(parser, project, config);
            await generator.generate('/output');

            const expectedFiles = [
                '/output/admin/users/users-list/users-list.component.ts',
                '/output/admin/users/users-list/users-list.component.html',
                '/output/admin/users/users-list/users-list.component.css',
                '/output/admin/users/user-form/user-form.component.ts',
                '/output/admin/users/user-form/user-form.component.html',
                '/output/admin/users/user-form/user-form.component.css',
                '/output/admin/users/users-admin-routing.module.ts',
                '/output/admin/users/users-admin.module.ts',
            ];

            for (const filePath of expectedFiles) {
                const sourceFile = project.getSourceFile(filePath);
                expect(sourceFile, `File not found: ${filePath}`).toBeDefined();
            }
        });

        it('should generate correct content for the list component HTML', async () => {
            const generator = new AdminGenerator(parser, project, config);
            await generator.generate('/output');

            const htmlFile = project.getSourceFileOrThrow('/output/admin/users/users-list/users-list.component.html');
            const content = htmlFile.getFullText();

            expect(content).toContain('<h1>Users</h1>');
            expect(content).toContain('<ng-container matColumnDef="username">');
            expect(content).toContain('<ng-container matColumnDef="isAdmin">');
            expect(content).toContain('<button mat-icon-button color="warn" (click)="delete(element.id)"');
        });

        it('should generate correct content for the form component HTML', async () => {
            const generator = new AdminGenerator(parser, project, config);
            await generator.generate('/output');

            const htmlFile = project.getSourceFileOrThrow('/output/admin/users/user-form/user-form.component.html');
            const content = htmlFile.getFullText();

            expect(content).toContain("<h1>{{isEditMode ? 'Edit' : 'Create'}} User</h1>");
            expect(content).toContain('<input matInput type="text" formControlName="username">');
            expect(content).toContain('<mat-checkbox formControlName="isAdmin">Is Admin</mat-checkbox>');
        });

        it('should generate correct content for the form component TypeScript', async () => {
            const generator = new AdminGenerator(parser, project, config);
            await generator.generate('/output');

            const tsFile = project.getSourceFileOrThrow('/output/admin/users/user-form/user-form.component.ts');
            const content = tsFile.getFullText();

            expect(content).toContain('class UserFormComponent implements OnInit');
            expect(content).toContain("'username': [null, [Validators.required, Validators.minLength(3)]]");
            expect(content).toContain("'isAdmin': [null, []]");
        });
    });
});
