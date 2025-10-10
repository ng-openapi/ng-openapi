import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import { Project } from "ts-morph";
import { AdminGenerator } from "../src/lib/generators/admin/admin.generator";
import * as fs from 'fs';
import * as path from 'path';

// --- MOCKS ---
const originalFs = require('fs');
vi.mock('fs');

// --- SPECS for TESTING ---

const ultimateSpec = {
    openapi: '3.0.0',
    info: { title: 'Ultimate Test API', version: '1.0.0' },
    paths: {
        '/servers': {
            get: { tags: ['Servers'], responses: { '200': { description: 'OK', schema: { type: 'array', items: { $ref: '#/components/schemas/Server' } } } } },
            post: { tags: ['Servers'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateServer' } } } } }
        },
        '/servers/{id}': {
            get: { tags: ['Servers'], parameters: [{ name: 'id', in: 'path' }] },
            put: { tags: ['Servers'], parameters: [{ name: 'id', in: 'path' }] }
        }
    },
    components: {
        schemas: {
            Server: { type: 'object', properties: {} },
            CreateServer: {
                type: 'object',
                required: ['name', 'priority', 'status'],
                properties: {
                    name: { type: 'string', minLength: 3, maxLength: 50 },
                    notes: { type: 'string', format: 'textarea' },
                    priority: { type: 'string', enum: ['Low', 'Normal', 'High'] },
                    status: { type: 'string', enum: ['PENDING', 'ONLINE', 'OFFLINE', 'MAINTENANCE', 'DECOMMISSIONED'] },
                    isEnabled: { type: 'boolean' },
                    cpuUsage: { type: 'integer', minimum: 0, maximum: 100 },
                    tags: { type: 'array', items: { type: 'string' } },
                    backupDays: { type: 'array', items: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } },
                    launchDate: { type: 'string', format: 'date' }
                }
            }
        }
    }
};

const advancedSpec = {
    openapi: '3.0.0',
    info: { title: 'Advanced Test API', version: '1.0.0' },
    paths: {
        '/projects/{id}': {
            get: { tags: ['Projects'], parameters: [{ name: 'id', in: 'path'}] },
            put: { tags: ['Projects'], parameters: [{ name: 'id', in: 'path'}] }
        },
        '/projects': {
            post: { tags: ['Projects'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProject' } } } } }
        }
    },
    components: {
        schemas: {
            CreateProject: {
                type: 'object',
                required: ['projectName', 'milestones'],
                properties: {
                    id: { type: 'integer', readOnly: true },
                    projectName: { type: 'string' },
                    contactPerson: { $ref: '#/components/schemas/ContactPerson' },
                    milestones: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Milestone' }
                    }
                }
            },
            ContactPerson: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' }, email: { type: 'string' } }
            },
            Milestone: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    dueDate: { type: 'string', format: 'date' }
                }
            }
        }
    }
};

const relationshipSpec = {
    openapi: '3.0.0',
    info: { title: 'Bookstore API', version: '1.0' },
    paths: {
        '/books': {
            get: { tags: ['Books'], responses: { '200': { description: 'OK', schema: { type: 'array', items: { $ref: '#/components/schemas/Book' } } } } },
            post: { tags: ['Books'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBook' } } } } }
        },
        '/books/{id}': {
            get: { tags: ['Books'], parameters: [{ name: 'id', in: 'path' }] },
            put: { tags: ['Books'], parameters: [{ name: 'id', in: 'path' }] },
            delete: { tags: ['Books'], parameters: [{ name: 'id', in: 'path' }] }
        },
        '/authors': {
            get: { tags: ['Authors'], responses: { '200': { description: 'OK', schema: { type: 'array', items: { $ref: '#/components/schemas/Author' } } } } },
            post: { tags: ['Authors'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAuthor' } } } } }
        },
        '/publishers': {
            post: { tags: ['Publishers'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePublisher' } } } } }
        }
    },
    components: {
        schemas: {
            Book: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' }, author: { $ref: '#/components/schemas/Author' } } },
            CreateBook: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    author: { $ref: '#/components/schemas/Author' },
                    publisher: { $ref: '#/components/schemas/Publisher' }
                }
            },
            Author: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
            CreateAuthor: { type: 'object', properties: { name: { type: 'string' } } },
            Publisher: { type: 'object', properties: { name: { type: 'string' }, location: { type: 'string' } } },
            CreatePublisher: { type: 'object', properties: { name: { type: 'string' }, location: { type: 'string' } } }
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
        let formComponentHtml: string;
        let formComponentTs: string;
        beforeEach(async () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(ultimateSpec, project, { options: { admin: { booleanType: 'slide-toggle' } as any } });
            await generator.generate('/output');
            formComponentHtml = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.html').getFullText();
            formComponentTs = project.getSourceFileOrThrow('/output/admin/servers/server-form/server-form.component.ts').getFullText();
        });

        it("should generate a MatDatepicker from a string with date format", () => expect(formComponentHtml).toContain('mat-datepicker-toggle'));
        it("should generate a MatButtonToggleGroup from an array with an enum", () => expect(formComponentHtml).toContain('mat-button-toggle-group'));
        it("should generate a MatRadioGroup from an enum with 4 or fewer options", () => expect(formComponentHtml).toContain('mat-radio-group'));
        it("should generate a MatSelect from an enum with more than 4 options", () => expect(formComponentHtml).toContain('mat-select'));
        it("should generate MatSlideToggles from a boolean when configured", () => expect(formComponentHtml).toContain('mat-slide-toggle'));
        it("should generate a MatChipList from a string array", () => expect(formComponentHtml).toContain('mat-chip-grid'));
        it("should generate a MatSlider from an integer with min and max", () => expect(formComponentHtml).toContain('mat-slider'));
        it("should generate a textarea from a string with textarea format", () => expect(formComponentHtml).toContain('<textarea matInput'));
        it("should generate FormControls with validators", () => expect(formComponentTs).toContain('validators: [Validators.required, Validators.minLength(3), Validators.maxLength(50)]'));
    });

    describe('Advanced Schema Handling (FormGroup)', () => {
        let formComponentHtml: string;
        let formComponentTs: string;
        beforeEach(async () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(advancedSpec, project);
            await generator.generate('/output');
            formComponentHtml = project.getSourceFileOrThrow('/output/admin/projects/project-form/project-form.component.html').getFullText();
            formComponentTs = project.getSourceFileOrThrow('/output/admin/projects/project-form/project-form.component.ts').getFullText();
        });

        it('should NOT generate form controls for readOnly properties', () => {
            expect(formComponentTs).not.toContain("'id': new FormControl");
            expect(formComponentHtml).not.toContain('formControlName="id"');
        });

        it('should generate a nested FormGroup for object properties', () => {
            const expectedTsStructure = `'contactPerson': new FormGroup({
                'name': new FormControl<CreateProject['contactPerson']['name']>("", { validators: [Validators.required], nonNullable: true }),
                'email': new FormControl<CreateProject['contactPerson']['email'] | null>(null)
            })`;
            expect(formComponentTs.replace(/\s/g, '')).toContain(expectedTsStructure.replace(/\s/g, ''));
        });

        it('should generate HTML with formGroupName for nested objects', () => {
            expect(formComponentHtml).toContain('<mat-expansion-panel>');
            expect(formComponentHtml).toContain('formGroupName="contactPerson"');
        });
    });

    describe('FormArray Generation', () => {
        let formComponentHtml: string;
        let formComponentTs: string;
        beforeEach(async () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(advancedSpec, project);
            await generator.generate('/output');
            formComponentHtml = project.getSourceFileOrThrow('/output/admin/projects/project-form/project-form.component.html').getFullText();
            formComponentTs = project.getSourceFileOrThrow('/output/admin/projects/project-form/project-form.component.ts').getFullText();
        });

        it('should generate a FormArray for a required array of objects', () => {
            const expectedTs = `'milestones': new FormArray([], { validators: [Validators.required] })`;
            expect(formComponentTs.replace(/\s/g, '')).toContain(expectedTs.replace(/\s/g, ''));
        });

        it('should generate helper methods for the FormArray', () => {
            expect(formComponentTs).toContain('get milestones(): FormArray');
            expect(formComponentTs).toContain('createMilestone(): FormGroup');
            expect(formComponentTs).toContain('addMilestone(): void');
            expect(formComponentTs).toContain('removeMilestone(index: number): void');
        });

        it('should generate patch logic for the FormArray in edit mode', () => {
            const expectedPatchLogic = `
        this.milestones.clear();
        (data as any).milestones?.forEach((item: any) => {
          const formGroup = this.createMilestone();
          formGroup.patchValue(item as any);
          this.milestones.push(formGroup);
        });
        delete (data as any).milestones;`;

            expect(formComponentTs.replace(/\s/g, '')).toContain(expectedPatchLogic.replace(/\s/g, ''));
        });

        it('should generate correct HTML for the FormArray', () => {
            expect(formComponentHtml).toContain('formArrayName="milestones"');
            expect(formComponentHtml).toContain('@for(item of milestones.controls; track $index)');
            expect(formComponentHtml).toContain('[formGroupName]="$index"');
            expect(formComponentHtml).toContain('(click)="addMilestone()"');
            expect(formComponentHtml).toContain('(click)="removeMilestone($index)"');
            expect(formComponentHtml).toContain(`At least one Milestone is required.`);
        });
    });

    describe('Default Value Generation', () => {
        const defaultValueSpec = { openapi: '3.0.0', info: { title: 'Default Test API', version: '1.0' }, paths: { '/configs': { get: { tags: ['Configs'] }, post: { tags: ['Configs'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateConfig' } } } } } } }, components: { schemas: { CreateConfig: { type: 'object', properties: { name: { type: 'string', default: 'Default Name' }, retries: { type: 'integer', default: 3 }, isActive: { type: 'boolean', default: true }, tags: { type: 'array', items: { type: 'string' }, default: ['initial', 'default'] }, description: { type: 'string' } } } } } };
        let formComponentTs: string;
        beforeEach(async () => {
            const project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(defaultValueSpec, project);
            await generator.generate('/output');
            formComponentTs = project.getSourceFileOrThrow('/output/admin/configs/config-form/config-form.component.ts').getFullText();
        });

        it('should use the default value from a string property', () => expect(formComponentTs).toContain(`'name': new FormControl<CreateConfig['name'] | null>("Default Name")`));
        it('should use the default value from a number property', () => expect(formComponentTs).toContain(`'retries': new FormControl<CreateConfig['retries'] | null>(3)`));
        it('should use the default value from a boolean property', () => expect(formComponentTs).toContain(`'isActive': new FormControl<CreateConfig['isActive'] | null>(true)`));
        it('should use the default value from an array property', () => expect(formComponentTs).toContain(`'tags': new FormControl<CreateConfig['tags'] | null>(["initial", "default"])`));
        it('should use null for a property without a default value', () => expect(formComponentTs).toContain(`'description': new FormControl<CreateConfig['description'] | null>(null)`));
    });

    describe('Full Resource Generation (List, Form, Routes)', () => {
        let listTs: string, listHtml: string;
        let formTs: string, formHtml: string;
        let authorListHtml: string;
        let routesTs: string;
        let project: Project;

        beforeEach(async () => {
            project = new Project({ useInMemoryFileSystem: true });
            const generator = await setupGenerator(relationshipSpec, project);
            await generator.generate('/output');

            listTs = project.getSourceFileOrThrow('/output/admin/books/books-list/books-list.component.ts').getFullText();
            listHtml = project.getSourceFileOrThrow('/output/admin/books/books-list/books-list.component.html').getFullText();
            formTs = project.getSourceFileOrThrow('/output/admin/books/book-form/book-form.component.ts').getFullText();
            formHtml = project.getSourceFileOrThrow('/output/admin/books/book-form/book-form.component.html').getFullText();
            routesTs = project.getSourceFileOrThrow('/output/admin/books/books.routes.ts').getFullText();
            authorListHtml = project.getSourceFileOrThrow('/output/admin/authors/authors-list/authors-list.component.html').getFullText();
        });

        describe('List Component', () => {
            it('should generate correct service and model imports', () => {
                expect(listTs).toContain(`import { BooksService } from '../../../services';`);
                expect(listTs).toContain(`import { Book } from '../../../models';`);
            });

            it('should generate loadData and delete methods with correct service calls', () => {
                expect(listTs).toContain('loadData() { this.svc.booksGET({} as any)');
                // ===== THE FIX: Corrected booksIdDELETE to booksidDELETE =====
                expect(listTs).toContain(`delete(id: number | string): void { if (confirm('Are you sure?')) { this.svc.booksidDELETE({ id: id } as any)`);
            });

            it('should generate HTML with a mat-table and the correct columns', () => {
                expect(listHtml).toContain('<table mat-table');
                expect(listHtml).toContain('matColumnDef="title"');
                expect(listHtml).not.toContain('matColumnDef="author"');
            });

            it('should generate Create, Edit, and Delete buttons when all operations are present', () => {
                expect(listHtml).toContain(`[routerLink]="['../new']"`);
                expect(listHtml).toContain(`[routerLink]="['../', element.id]"`);
                expect(listHtml).toContain(`(click)="delete(element.id)"`);
            });

            it('should NOT generate a Delete button when the DELETE operation is missing', () => {
                expect(authorListHtml).not.toContain('(click)="delete(element.id)"');
            });
        });

        describe('Form Component (Relationships)', () => {
            it('should inject the service for the related resource, but not for nested objects', () => {
                expect(formTs).toContain(`private readonly authorSvc = inject(AuthorsService);`);
                expect(formTs).not.toContain(`private readonly publisherSvc = inject(PublishersService);`);
            });

            it('should create a signal and fetch data for the related resource', () => {
                expect(formTs).toContain(`readonly authorItems = signal<Author[]>([]);`);
                expect(formTs).toContain(`this.authorSvc.authorsGET({} as any).subscribe(data => this.authorItems.set(data as any[]));`);
            });

            it('should generate a FormControl for the relationship and a FormGroup for the nested object', () => {
                const formDef = formTs.substring(formTs.indexOf('readonly form = new FormGroup({'), formTs.indexOf('});'));
                expect(formDef).toContain(`'author': new FormControl<CreateBook['author'] | null>(null)`);
                expect(formDef).toContain(`'publisher': new FormGroup({`);
            });

            it('should generate a mat-select for the relationship and a formGroupName for the nested object', () => {
                expect(formHtml).toContain('<mat-select formControlName="author"');
                expect(formHtml).toContain('@for(item of authorItems(); track item.id)');
                expect(formHtml).toContain('formGroupName="publisher"');
                expect(formHtml).toContain('formControlName="location"');
            });

            it('should generate a compareWith function for object selection', () => {
                expect(formTs).toContain('compareById = (o1: any, o2: any): boolean => o1?.id === o2?.id;');
            });
        });

        describe('Routing Module', () => {
            it('should generate correct routes for list, new, and edit', () => {
                expect(routesTs).toContain(`path: '', title: 'Books', loadComponent: () => import('./books-list/books-list.component')`);
                expect(routesTs).toContain(`path: 'new', title: 'Create Book', loadComponent: () => import('./book-form/book-form.component')`);
                expect(routesTs).toContain(`path: ':id', title: 'Edit Book', loadComponent: () => import('./book-form/book-form.component')`);
            });
        });
    });
});
