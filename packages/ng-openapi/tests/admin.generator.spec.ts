import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import { Project } from "ts-morph";
import { AdminGenerator } from "../src/lib/generators/admin/admin.generator";
import * as fs from 'fs';
import * as path from 'path';

// --- MOCKS ---
const originalFs = require('fs');
vi.mock('fs');

// The ultimate spec to test every implemented component individually
const ultimateSpec = {
    openapi: '3.0.0',
    info: { title: 'Ultimate Test API', version: '1.0.0' },
    paths: {
        '/servers': {
            get: { tags: ['Servers'], responses: { '200': { description: 'OK' } } },
            post: { tags: ['Servers'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateServer' } } } } }
        }, '/servers/{id}': { get: { tags: ['Servers'], parameters: [{ name: 'id', in: 'path' }] } }
    },
    components: {
        schemas: {
            CreateServer: {
                type: 'object',
                required: ['name', 'priority', 'status'],
                properties: {
                    name: { type: 'string', description: 'Server name.', minLength: 3, maxLength: 50 },
                    ipAddress: { type: 'string', pattern: '^([0-9]{1,3}\\.){3}[0-9]{1,3}$' },
                    notes: { type: 'string', format: 'textarea' },
                    priority: { type: 'string', enum: ['Low', 'Normal', 'High'] },
                    status: { type: 'string', enum: ['PENDING', 'ONLINE', 'OFFLINE', 'MAINTENANCE', 'DECOMMISSIONED'] },
                    isDefault: { type: 'boolean' }, isEnabled: { type: 'boolean' },
                    cpuUsage: { type: 'integer', minimum: 0, maximum: 100 },
                    tags: { type: 'array', items: { type: 'string' } },
                    backupDays: { type: 'array', items: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } },
                    launchDate: { type: 'string', format: 'date' }
                }
            }
        }
    }
};

// --- TEST SUITE ---
describe('AdminGenerator', () => {
    async function setupGenerator(spec: any, proj: Project, partialConfig: Partial<GeneratorConfig> = {}) {
        const config: GeneratorConfig = { input: 'mock-spec.json', output: '/output', options: { admin: true }, ...partialConfig };
        if (partialConfig.options) { config.options = { ...config.options, ...partialConfig.options }; }

        vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
            if (p.toString().endsWith('mock-spec.json')) return JSON.stringify(spec);
            if (p.toString().includes('.template')) {
                const templateName = path.basename(p);
                const actualPath = path.resolve(__dirname, `../src/lib/generators/admin/templates/${templateName}`);
                return originalFs.readFileSync(actualPath, 'utf8');
            } return '';
        });
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        const parser = await SwaggerParser.create(config.input, config);
        return new AdminGenerator(parser, proj, config);
    }

    afterEach(() => { vi.restoreAllMocks(); });

    describe('Individual Component Generation', () => {
        let formComponentHtml: string; let formComponentTs: string;
        beforeEach(async () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(ultimateSpec, project, { options: { admin: { booleanType: 'slide-toggle' } } });
            await generator.generate('/output');
            formComponentHtml = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.html').getFullText();
            formComponentTs = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.ts').getFullText();
        });

        it("should generate a MatDatepicker from `{ type: 'string', format: 'date' }`", () => {
            expect(formComponentHtml).toContain('mat-datepicker-toggle');
            expect(formComponentHtml).toContain('<mat-datepicker #pickerLaunchDate></mat-datepicker>');
            expect(formComponentTs).toContain('import { MatDatepickerModule }');
        });
        it("should generate a MatButtonToggleGroup from `{ type: 'array', items: { enum: [...] } }`", () => {
            expect(formComponentHtml).toContain('<label class="mat-body-strong">Backup Days</label>');
            expect(formComponentHtml).toContain('<mat-button-toggle-group formControlName="backupDays" multiple>');
            expect(formComponentTs).toContain('import { MatButtonToggleModule }');
        });
        it("should generate a MatRadioGroup from an `enum` with 4 or fewer options", () => {
            expect(formComponentHtml).toContain('<label class="mat-body-strong">Priority</label>');
            expect(formComponentHtml).toContain('<mat-radio-group formControlName="priority">');
            expect(formComponentTs).toContain('import { MatRadioModule }');
        });
        it("should generate a MatSelect from an `enum` with more than 4 options", () => {
            expect(formComponentHtml).toContain('<mat-label>Status</mat-label>');
            expect(formComponentHtml).toContain('<mat-select formControlName="status">');
            expect(formComponentTs).toContain('import { MatSelectModule }');
        });
        it("should generate MatSlideToggles from `{ type: 'boolean' }` when configured", () => {
            expect(formComponentHtml).toContain('<mat-slide-toggle formControlName="isDefault">Is Default</mat-slide-toggle>');
            expect(formComponentHtml).not.toContain('<mat-checkbox');
            expect(formComponentTs).toContain('import { MatSlideToggleModule }');
        });
        it("should generate a MatChipList from `{ type: 'array', items: { type: 'string' } }`", () => {
            expect(formComponentHtml).toContain('<mat-chip-grid');
            expect(formComponentHtml).toContain('<mat-chip-listbox');
            expect(formComponentTs).toContain('import { MatChipsModule }');
        });
        it("should generate a MatSlider from `{ type: 'integer', minimum: X, maximum: Y }`", () => {
            expect(formComponentHtml).toContain('<label class="mat-body-strong">Cpu Usage</label>');
            expect(formComponentHtml).toContain('<mat-slider min="0" max="100"');
            expect(formComponentTs).toContain('import { MatSliderModule }');
        });
        it("should generate a <textarea> from `{ format: 'textarea' }`", () => {
            expect(formComponentHtml).toContain('<textarea matInput formControlName="notes"></textarea>');
        });
        it("should generate a MatInput with pattern validator from `{ pattern: '...' }`", () => {
            const expectedValidator = `'ipAddress': [null as any, [Validators.pattern(/^([0-9]{1,3}\\\\.){3}[0-9]{1,3}$/)]]`;
            expect(formComponentTs).toContain(expectedValidator);
        });
    });

    describe('Complete Form Generation Scenarios', () => {
        it('should successfully generate a simple "Blog Post" form', async() => {
            const blogPostSpec = { openapi: '3.0.0', info: { version: '1.0', title: 'Blog API' }, paths: { '/posts': { get: { tags: ['Posts'] }, post: { tags: ['Posts'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePost' } } } } } } }, components: { schemas: { CreatePost: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, content: { type: 'string', format: 'textarea' }, tags: { type: 'array', items: { type: 'string' } }, isPublished: { type: 'boolean' } } } } } };
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(blogPostSpec, project);
            await generator.generate('/output');

            const formFile = project.getSourceFile('/output/admin/posts/post-form/post-form.component.ts');
            expect(formFile).toBeDefined();
            const formHtml = project.getSourceFile('/output/admin/posts/post-form/post-form.component.html')?.getFullText();
            expect(formHtml).toContain('formControlName="title"');
            expect(formHtml).toContain('<textarea matInput formControlName="content"');
            expect(formHtml).toContain('<mat-chip-listbox');
            expect(formHtml).toContain('<mat-checkbox formControlName="isPublished"');
        });

        it('should successfully generate a complex "Product" form', async() => {
            const productSpec = { openapi: '3.0.0', info: { version: '1.0', title: 'Product API' }, paths: { '/products': { get: { tags: ['Products'] }, post: { tags: ['Products'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProduct' } } } } } } }, components: { schemas: { CreateProduct: { type: 'object', properties: { price: { type: 'number' }, category: { type: 'string', enum: ['A','B','C','D','E'] }, warrantyExpiry: { type: 'string', format: 'date' }, regions: { type: 'array', items: { type: 'string', enum: ['NA', 'EU', 'APAC'] } }, stock: { type: 'integer', minimum: 0, maximum: 1000 } } } } } };
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(productSpec, project);
            await generator.generate('/output');

            const formFile = project.getSourceFile('/output/admin/products/product-form/product-form.component.ts');
            expect(formFile).toBeDefined();
            const formHtml = project.getSourceFile('/output/admin/products/product-form/product-form.component.html')?.getFullText();
            expect(formHtml).toContain('<mat-select formControlName="category"');
            expect(formHtml).toContain('<mat-datepicker');
            expect(formHtml).toContain('<mat-button-toggle-group formControlName="regions"');
            expect(formHtml).toContain('<mat-slider min="0" max="1000"');
        });

        it('should FAIL to generate a form if POST requestBody is missing', async() => {
            const missingBodySpec = { openapi: '3.0.0', info: { version: '1.0', title: 'Fail API' }, paths: { '/logs': { get: { tags: ['Logs'] }, post: { tags: ['Logs'] } } } }; // POST has no requestBody
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(missingBodySpec, project);
            await generator.generate('/output');

            expect(() => project.getSourceFileOrThrow('/output/admin/logs/log-form/log-form.component.ts')).toThrow();
        });

        it('should FAIL to generate a form if schema is inline and not a $ref', async () => {
            const inlineSchemaSpec = { openapi: '3.0.0', info: { version: '1.0', title: 'Fail API' }, paths: { '/tasks': { get: { tags: ['Tasks'] }, post: { tags: ['Tasks'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } } } } } };
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(inlineSchemaSpec, project);
            await generator.generate('/output');

            const resources = generator.collectResources();
            expect(resources.find(r => r.name === 'task')).toBeUndefined();
            expect(() => project.getSourceFileOrThrow('/output/admin/tasks/task-form/task-form.component.ts')).toThrow();
        });

        it('should FAIL to identify a resource if the POST operation is missing', async () => {
            const getOnlySpec = { openapi: '3.0.0', info: { version: '1.0', title: 'Fail API' }, paths: { '/reports': { get: { tags: ['Reports'] } } } }; // No POST operation
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(getOnlySpec, project);

            const resources = generator.collectResources();
            expect(resources.length).toBe(0);
        });
    });
});
