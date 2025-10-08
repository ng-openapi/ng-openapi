import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import { Project } from "ts-morph";
import { AdminGenerator } from "../src/lib/generators/admin/admin.generator";
import * as fs from 'fs';
import * as path from 'path';

// Define `originalFs` once at the top level
const originalFs = require('fs');

vi.mock('fs');

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
            User: { type: 'object', properties: { id: { type: 'integer', readOnly: true }, username: { type: 'string' } } },
            Post: {
                type: 'object', required: ['title'],
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
            Tag: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } }
        }
    }
};

describe('AdminGenerator', () => {
    let project: Project;

    async function setupGenerator(spec: any, options: any = {}): Promise<AdminGenerator> {
        const config: GeneratorConfig = { input: 'mock-spec.json', output: '', options };

        // --- THIS IS THE CORRECTED MOCK ---
        vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, ...args: any[]) => {
            const pStr = p.toString();
            if (pStr === 'mock-spec.json') {
                return JSON.stringify(spec);
            }
            // For template files, use the unmocked `originalFs` to read from the actual filesystem
            if (pStr.includes('.template')) {
                return originalFs.readFileSync(p, ...args);
            }
            return ''; // Return empty for other unexpected reads
        });

        vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
            const pStr = p.toString();
            if (pStr === 'mock-spec.json') {
                return true;
            }
            // For template files, use the unmocked `originalFs` to check the actual filesystem
            if (pStr.includes('.template')) {
                return originalFs.existsSync(p);
            }
            return true; // Mock existence for other paths to prevent unrelated errors
        });

        const parser = await SwaggerParser.create(config.input, config);
        project = new Project({ useInMemoryFileSystem: true });
        return new AdminGenerator(parser, project, config);
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

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

        it('should extract detailed form properties including validators and enums', async () => {
            const generator = await setupGenerator(complexMockSpec);
            const postResource = generator.collectResources().find(r => r.name === 'post')!;
            const titleProp = postResource.formProperties.find(p => p.name === 'title')!;
            expect(titleProp.required).toBe(true);
            expect(titleProp.validators).toContain('Validators.required');
            expect(titleProp.validators).toContain('Validators.minLength(5)');
        });
    });

    describe('File Generation', () => {
        it('should create all required modern files for multiple resources', async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');

            const userFiles = [
                '/output/admin/users/users-list/users-list.component.ts',
                '/output/admin/users/user-form/user-form.component.html',
                '/output/admin/users/users.routes.ts'
            ];
            const postFiles = [
                '/output/admin/posts/posts-list/posts-list.component.ts',
                '/output/admin/posts/post-form/post-form.component.html',
                '/output/admin/posts/posts.routes.ts'
            ];

            for (const filePath of [...userFiles, ...postFiles]) {
                expect(project.getSourceFile(filePath), `File not found: ${filePath}`).toBeDefined();
            }
        });

        it('should generate standalone components', async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');

            const listTs = project.getSourceFileOrThrow('/output/admin/users/users-list/users-list.component.ts').getFullText();
            expect(listTs).toContain('standalone: true');

            const formTs = project.getSourceFileOrThrow('/output/admin/users/user-form/user-form.component.ts').getFullText();
            expect(formTs).toContain('standalone: true');
        });

        it('should NOT generate a delete method for resources without a DELETE operation', async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');

            const listTs = project.getSourceFileOrThrow('/output/admin/posts/posts-list/posts-list.component.ts');
            expect(listTs.getClass('PostListComponent')?.getMethod('delete')).toBeUndefined();
        });
    });

    describe('Generated Form Content', () => {
        let formHtml: string;

        beforeEach(async () => {
            const generator = await setupGenerator(complexMockSpec);
            await generator.generate('/output');
            formHtml = project.getSourceFileOrThrow('/output/admin/posts/post-form/post-form.component.html').getFullText();
        });

        it('should generate a standard text input', () => {
            expect(formHtml).toContain('<input matInput type="text" formControlName="title">');
        });

        it('should generate a select dropdown for an enum', () => {
            expect(formHtml).toContain('<mat-select formControlName="status">');
            expect(formHtml).toContain('<mat-option value="draft">draft</mat-option>');
        });

        it('should generate a number input', () => {
            expect(formHtml).toContain('<input matInput type="number" formControlName="rating">');
        });

        it('should generate a checkbox for a boolean', () => {
            expect(formHtml).toContain('<mat-checkbox formControlName="isPublished">');
        });

        it('should include a mat-error for required fields', () => {
            const getFieldHtml = (name: string) => {
                const regex = new RegExp(`<mat-form-field((?!<mat-form-field)[\\s\\S])*?formControlName="${name}"[\\s\\S]*?<\\/mat-form-field>`, 'm');
                const match = formHtml.match(regex);
                return match ? match[0] : null;
            };

            const titleFieldHtml = getFieldHtml('title');
            expect(titleFieldHtml).not.toBeNull();
            expect(titleFieldHtml).toContain(`hasError('required')`);

            const ratingFieldHtml = getFieldHtml('rating');
            expect(ratingFieldHtml).not.toBeNull();
            expect(ratingFieldHtml).not.toContain(`hasError('required')`);
        });
    });
});
