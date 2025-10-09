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
        }, '/servers/{id}': {
            get: { tags: ['Servers'], parameters: [{ name: 'id', in: 'path' }] },
            put: { tags: ['Servers'], parameters: [{ name: 'id', in: 'path' }] }
        }
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
            const generator = await setupGenerator(ultimateSpec, project, { options: { admin: { booleanType: 'slide-toggle' } as any } });
            await generator.generate('/output');
            formComponentHtml = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.html').getFullText();
            formComponentTs = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.ts').getFullText();
        });

        it("should generate a MatDatepicker from a string with date format", () => {
            expect(formComponentHtml).toContain('mat-datepicker-toggle');
        });
        it("should generate a MatButtonToggleGroup from an array with an enum", () => {
            expect(formComponentHtml).toContain('mat-button-toggle-group');
        });
        it("should generate a MatRadioGroup from an enum with 4 or fewer options", () => {
            expect(formComponentHtml).toContain('mat-radio-group');
        });
        it("should generate a MatSelect from an enum with more than 4 options", () => {
            expect(formComponentHtml).toContain('mat-select');
        });
        it("should generate MatSlideToggles from a boolean when configured", () => {
            expect(formComponentHtml).toContain('mat-slide-toggle');
        });
        it("should generate a MatChipList from a string array", () => {
            expect(formComponentHtml).toContain('mat-chip-grid');
        });
        it("should generate a MatSlider from an integer with min and max", () => {
            expect(formComponentHtml).toContain('mat-slider');
        });
        it("should generate a textarea from a string with textarea format", () => {
            expect(formComponentHtml).toContain('<textarea matInput');
        });

        it("should generate a FormControl with a pattern validator", () => {
            // This is the literal string expected in the generated file.
            // The `\\.` is how a `\.` is represented inside a TypeScript regex literal.
            // We use a simple string `toContain` check, which is more robust than a complex regex.
            const expectedControlString = `'ipAddress': new FormControl<CreateServer['ipAddress'] | null>(null, { validators: [Validators.pattern(/^([0-9]{1,3}\\.){3}[0-9]{1,3}$/)] })`;

            // Remove all whitespace from both the actual and expected strings for a robust comparison.
            const normalizedActual = formComponentTs.replace(/\s/g, '');
            const normalizedExpected = expectedControlString.replace(/\s/g, '');

            expect(normalizedActual).toContain(normalizedExpected);
        });
    });

    describe('Default Value Generation', () => {
        const defaultValueSpec = {
            openapi: '3.0.0', info: { title: 'Default Test API', version: '1.0' }, paths: { '/configs': { get: { tags: ['Configs'] }, post: { tags: ['Configs'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateConfig' } } } } } } },
            components: { schemas: { CreateConfig: { type: 'object', properties: { name: { type: 'string', default: 'Default Name' }, retries: { type: 'integer', default: 3 }, isActive: { type: 'boolean', default: true }, tags: { type: 'array', items: { type: 'string' }, default: ['initial', 'default'] }, description: { type: 'string' } } } } }
        };

        let formComponentTs: string;

        beforeEach(async () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(defaultValueSpec, project);
            await generator.generate('/output');
            formComponentTs = project.getSourceFileOrThrow('/output/admin/configs/config-form/config-form.component.ts').getFullText();
        });

        it('should use the default value from a string property', () => {
            expect(formComponentTs).toContain(`'name': new FormControl<CreateConfig['name'] | null>("Default Name")`);
        });

        it('should use the default value from a number property', () => {
            expect(formComponentTs).toContain(`'retries': new FormControl<CreateConfig['retries'] | null>(3)`);
        });

        it('should use the default value from a boolean property', () => {
            expect(formComponentTs).toContain(`'isActive': new FormControl<CreateConfig['isActive'] | null>(true)`);
        });

        it('should use the default value from an array property', () => {
            expect(formComponentTs).toContain(`'tags': new FormControl<CreateConfig['tags'] | null>(["initial", "default"])`);
        });

        it('should use null for a property without a default value', () => {
            expect(formComponentTs).toContain(`'description': new FormControl<CreateConfig['description'] | null>(null)`);
        });
    });
});
