import { describe, it, expect, beforeAll } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@ng-openapi/shared';

import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { advancedStructuresSpec } from './specs/test.specs';

describe('Integration: Form Structures Generation', () => {
    let project: Project;
    let formHtml: string;
    let formTs: string;

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: {} } } as any;
        // The parser needs a JavaScript object, not a JSON string.
        const parser = new SwaggerParser(JSON.parse(advancedStructuresSpec), config);
        const generator = new AdminGenerator(parser, project, config);
        await generator.generate('/output');

        formHtml = project.getSourceFileOrThrow('/output/admin/projects/project-form/project-form.component.html').getFullText();
        formTs = project.getSourceFileOrThrow('/output/admin/projects/project-form/project-form.component.ts').getFullText();
    });

    it('should NOT generate form controls for readOnly properties', () => {
        expect(formTs).not.toContain(`'id': new FormControl`);
    });

    it('should generate a nested FormGroup for object properties', () => {
        expect(formTs).toContain(`'contactPerson': new FormGroup({`);
    });

    it('should generate HTML with formGroupName for nested objects', () => {
        expect(formHtml).toContain('formGroupName="contactPerson"');
    });

    it('should generate a FormArray for a required array of objects', () => {
        expect(formTs).toContain(`'milestones': new FormArray([], { validators: [Validators.required] })`);
    });

    it('should generate helper methods for the FormArray', () => {
        expect(formTs).toContain('get milestones(): FormArray');
        expect(formTs).toContain('createMilestone(): FormGroup');
        expect(formTs).toContain('addMilestone(): void');
        expect(formTs).toContain('removeMilestone(index: number): void');
    });

    it('should generate patch logic for the FormArray in edit mode', () => {
        expect(formTs).toContain('this.milestones.clear();');
        expect(formTs).toContain('this.milestones.push(formGroup);');
    });

    it('should generate correct HTML for the FormArray', () => {
        expect(formHtml).toContain('formArrayName="milestones"');
        expect(formHtml).toContain('(click)="addMilestone()"');
        expect(formHtml).toContain('(click)="removeMilestone($index)"');
    });
});
