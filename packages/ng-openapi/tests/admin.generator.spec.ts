import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import { Project, SourceFile } from "ts-morph";
import { AdminGenerator } from "../src/lib/generators/admin/admin.generator";
import * as fs from 'fs';
import * as path from 'path';

// Mock the 'fs' module
vi.mock('fs');

// A more complex OpenAPI document for thorough testing
const complexMockSpec: any = {
    openapi: '3.0.0',
    info: { title: 'Complex Test API', version: '1.0.0' },
    paths: {
        '/users': {
            get: { tags: ['Users'], operationId: 'listUsers', responses: { '200': { description: 'OK' } } },
            post: { tags: ['Users'], operationId: 'createUser', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { '201': { description: 'Created' } } }
        },
        '/users/{userId}': {
            get: { tags: ['Users'], operationId: 'getUserById', parameters: [{ name: 'userId', in: 'path', required: true }], responses: { '200': { description: 'OK' } } },
            put: { tags: ['Users'], operationId: 'updateUser', parameters: [{ name: 'userId', in: 'path', required: true }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { '200': { description: 'OK' } } },
            delete: { tags: ['Users'], operationId: 'deleteUser', parameters: [{ name: 'userId', in: 'path', required: true }], responses: { '204': { description: 'No Content' } } }
        },
        '/posts': {
            get: { tags: ['Posts'], operationId: 'listPosts', responses: { '200': { description: 'OK' } } },
            post: { tags: ['Posts'], operationId: 'createPost', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } }, responses: { '201': { description: 'Created' } } }
        },
        '/posts/{postId}': {
            get: { tags: ['Posts'], operationId: 'getPostById', parameters: [{ name: 'postId', in: 'path', required: true }], responses: { '200': { description: 'OK' } } },
            put: { tags: ['Posts'], operationId: 'updatePost', parameters: [{ name: 'postId', in: 'path', required: true }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } }, responses: { '200': { description: 'OK' } } },
        },
        '/tags': {
            get: { tags: ['Tags'], operationId: 'listTags', responses: { '200': { description: 'OK' } } },
            post: { tags: ['Tags'], operationId: 'createTag', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Tag' } } } }, responses: { '201': { description: 'Created' } } }
        },
        '/tags/{tagId}': {
            get: { tags: ['Tags'], operationId: 'getTagById', parameters: [{ name: 'tagId', in: 'path', required: true }], responses: { '200': { description: 'OK' } } },
        }
    },
    components: {
        schemas: {
            User: {
                type: 'object',
                properties: { id: { type: 'integer', readOnly: true }, username: { type: 'string' } }
            },
            Post: {
                type: 'object',
                required: ['title'],
                properties: {
                    id: { type: 'integer', readOnly: true },
                    title: { type: 'string', minLength: 5 },
                    status: { type: 'string', enum: ['draft', 'published', 'archived'] },
                    views: { type: 'integer', readOnly: true },
                    rating: { type: 'number', minimum: 1, maximum: 5 },
                    isPublished: { type: 'boolean' },
                    publishedAt: { type: 'string', format: 'date-time' }
                }
            },
            Tag: {
                type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } }
            }
        }
    }
};

describe('AdminGenerator', () => {
    let project: Project;

    async function setupGenerator(spec: any, options: any = {}): Promise<AdminGenerator> {
        const config: GeneratorConfig = { input: 'mock-spec.json', output: '', options };
        vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
            if (p === 'mock-spec.json') {
                return JSON.stringify(spec);
            }
            const originalFs = require('fs');
            if (p.includes('.template')) {
                return originalFs.readFileSync(p, 'utf8');
            }
            return '';
        });
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);

        const parser = await SwaggerParser.create(config.input, config);
        project = new Project({ useInMemoryFileSystem: true });
        return new AdminGenerator(parser, project, config);
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ... (All other describe blocks are unchanged and correct)
    describe('Resource Collection', () => {
        it('should identify all valid RESTful resources', async () => {
            const generator = await setupGenerator(complexMockSpec);
            const resources = generator.collectResources();
            expect(resources.length).toBe(2);
            expect(resources.map(r => r.name)).toEqual(['user', 'post']);
        });

        it('should NOT identify incomplete resources (e.g., missing PUT)', async () => {
            const generator = await setupGenerator(complexMockSpec);
            const resources = generator.collectResources();
            expect(resources.find(r => r.name === 'tag')).toBeUndefined();
        });

        it('should correctly mark resources with optional delete operation', async () => {
            const generator = await setupGenerator(complexMockSpec);
            const resources = generator.collectResources();
            const userResource = resources.find(r => r.name === 'user')!;
            const postResource = resources.find(r => r.name === 'post')!;
            expect(userResource.operations.delete).toBeDefined();
            expect(postResource.operations.delete).toBeUndefined();
        });

        it('should extract detailed form properties including validators and enums', async () => {
            const generator = await setupGenerator(complexMockSpec);
            const postResource = generator.collectResources().find(r => r.name === 'post')!;
            const titleProp = postResource.formProperties.find(p => p.name === 'title')!;
            expect(titleProp.required).toBe(true);
            expect(titleProp.validators).toContain('Validators.required');
            expect(titleProp.validators).toContain('Validators.minLength(5)');
            const statusProp = postResource.formProperties.find(p => p.name === 'status')!;
            expect(statusProp.type).toBe('enum');
            expect(statusProp.enumValues).toEqual(['draft', 'published', 'archived']);
            const ratingProp = postResource.formProperties.find(p => p.name === 'rating')!;
            expect(ratingProp.type).toBe('number');
            expect(ratingProp.validators).toContain('Validators.min(1)');
            expect(ratingProp.validators).toContain('Validators.max(5)');
            const publishedAtProp = postResource.formProperties.find(p => p.name === 'publishedAt')!;
            expect(publishedAtProp.inputType).toBe('datetime-local');
        });

        it('should exclude readOnly properties from formProperties and listColumns', async () => {
            const generator = await setupGenerator(complexMockSpec);
            const postResource = generator.collectResources().find(r => r.name === 'post')!;
            expect(postResource.formProperties.find(p => p.name === 'id')).toBeUndefined();
            expect(postResource.formProperties.find(p => p.name === 'views')).toBeUndefined();
            expect(postResource.listColumns).not.toContain('id');
            expect(postResource.listColumns).not.toContain('views');
            expect(postResource.listColumns).toContain('title');
        });
    });

    describe('File Generation', () => {
        it('should create all required files for multiple resources', async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');
            const userFiles = [
                '/output/admin/users/users-list/users-list.component.ts',
                '/output/admin/users/user-form/user-form.component.html'
            ];
            const postFiles = [
                '/output/admin/posts/posts-list/posts-list.component.ts',
                '/output/admin/posts/post-form/post-form.component.html'
            ];
            for (const filePath of [...userFiles, ...postFiles]) {
                expect(project.getSourceFile(filePath), `File not found: ${filePath}`).toBeDefined();
            }
        });

        it('should NOT generate a delete button or method for resources without a DELETE operation', async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');
            const listHtml = project.getSourceFileOrThrow('/output/admin/posts/posts-list/posts-list.component.html').getFullText();
            expect(listHtml).not.toContain('(click)="delete(element.id)"');
            const listTs = project.getSourceFileOrThrow('/output/admin/posts/posts-list/posts-list.component.ts');
            const listClass = listTs.getClass('PostListComponent')!;
            expect(listClass.getMethod('delete')).toBeUndefined();
        });

        it('should generate a FormGroup with correct validators', async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');
            const formTsContent = project.getSourceFileOrThrow('/output/admin/posts/post-form/post-form.component.ts').getFullText();
            const formGroupRegex = /this\.fb\.group\({([\s\S]*?)}\)/;
            const match = formTsContent.match(formGroupRegex);
            expect(match).not.toBeNull();
            const formGroupContent = match![1];
            expect(formGroupContent).toContain("'title': [null, [Validators.required, Validators.minLength(5)]]");
            expect(formGroupContent).toContain("'rating': [null, [Validators.min(1), Validators.max(5)]]");
            expect(formGroupContent).toContain("'isPublished': [null, []]");
        });
    });

    describe('Generated Form Content', () => {
        let formHtml: string;

        beforeEach(async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');
            formHtml = project.getSourceFileOrThrow('/output/admin/posts/post-form/post-form.component.html').getFullText();
        });

        it('should generate a standard text input for a string property', () => {
            expect(formHtml).toContain('<mat-label>Title</mat-label>');
            expect(formHtml).toContain('<input matInput type="text" formControlName="title">');
        });

        it('should generate a select dropdown for an enum property', () => {
            expect(formHtml).toContain('<mat-label>Status</mat-label>');
            expect(formHtml).toContain('<mat-select formControlName="status">');
            expect(formHtml).toContain('<mat-option value="draft">draft</mat-option>');
            expect(formHtml).toContain('<mat-option value="published">published</mat-option>');
            expect(formHtml).toContain('<mat-option value="archived">archived</mat-option>');
        });

        it('should generate a number input for a number/integer property', () => {
            expect(formHtml).toContain('<mat-label>Rating</mat-label>');
            expect(formHtml).toContain('<input matInput type="number" formControlName="rating">');
        });

        it('should generate a checkbox for a boolean property', () => {
            expect(formHtml).toContain('<mat-checkbox formControlName="isPublished">Is Published</mat-checkbox>');
        });

        it('should generate a datetime-local input for a date-time property', () => {
            expect(formHtml).toContain('<mat-label>Published At</mat-label>');
            expect(formHtml).toContain('<input matInput type="datetime-local" formControlName="publishedAt">');
        });

        it('should include a mat-error for required fields and exclude it for optional fields', () => {
            // This helper function uses a more robust regex to isolate the correct form field.
            // It looks for a <mat-form-field> tag, but then uses a negative lookahead `((?!...))`
            // to ensure it doesn't cross over ANOTHER <mat-form-field> tag before finding the
            // form control we're interested in. This prevents the "greedy" matching bug.
            const getFieldHtml = (name: string) => {
                const regex = new RegExp(
                    `<mat-form-field((?!<mat-form-field)[\\s\\S])*?formControlName="${name}"(?:[\\s\\S]*?)<\\/mat-form-field>`,
                    'm'
                );
                const match = formHtml.match(regex);
                return match ? match[0] : null;
            };

            // 'title' is required in the spec
            const titleFieldHtml = getFieldHtml('title');
            expect(titleFieldHtml, `Could not find field for 'title'`).not.toBeNull();
            expect(titleFieldHtml).toContain(`hasError('required')`);

            // 'rating' is NOT required in the spec
            const ratingFieldHtml = getFieldHtml('rating');
            expect(ratingFieldHtml, `Could not find field for 'rating'`).not.toBeNull();
            expect(ratingFieldHtml).not.toContain(`hasError('required')`);

            // 'status' is NOT required in the spec
            const statusFieldHtml = getFieldHtml('status');
            expect(statusFieldHtml, `Could not find field for 'status'`).not.toBeNull();
            expect(statusFieldHtml).not.toContain(`hasError('required')`);
        });
    });
});
