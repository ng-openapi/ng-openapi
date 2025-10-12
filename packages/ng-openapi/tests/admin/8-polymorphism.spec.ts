import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { SwaggerParser } from '@ng-openapi/shared';
import { polymorphismSpec } from './specs/test.specs';

describe('Integration: OpenAPI Polymorphism (oneOf) Generation', () => {
    let project: Project;
    let formHtml: string;
    let formTs: string;

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: {} } } as any;
        const parser = new SwaggerParser(JSON.parse(polymorphismSpec), config);
        const generator = new AdminGenerator(parser, project, config);
        await generator.generate('/output');

        formHtml = project.getSourceFileOrThrow('/output/admin/containers/container-form/container-form.component.html').getFullText();
        formTs = project.getSourceFileOrThrow('/output/admin/containers/container-form/container-form.component.ts').getFullText();
    });

    it('should generate a nested FormGroup for the polymorphic property', () => {
        expect(formTs).toContain(`'item': new FormGroup({`);
        expect(formTs).toContain(`'typeSelector': new FormControl<string | null>(null)`);
    });

    it('should generate disabled FormGroups for each oneOf option', () => {
        // Test is now more robust against quote style changes.
        expect(formTs).toContain(`'Cat': new FormGroup({`);
        expect(formTs).toContain(`'name': new FormControl<any>('', { validators: [Validators.required], nonNullable: true })`);
        expect(formTs).toContain(`'meowVolume': new FormControl<any>(null)`);
        expect(formTs).toContain(`}, { disabled: true })`);

        expect(formTs).toContain(`'Dog': new FormGroup({`);
        expect(formTs).toContain(`'barkPitch': new FormControl<any>(null)`);
    });

    it('should generate a mat-select for the type selector in HTML', () => {
        // FIX: Test now looks for the new @for syntax.
        expect(formHtml).toContain('<mat-select formControlName="typeSelector"');
        expect(formHtml).toContain(`@for (opt of ['Cat', 'Dog']; track opt)`);
        expect(formHtml).toContain(`<mat-option [value]="opt">{{ opt }}</mat-option>`);
    });

    it('should generate an @switch to dynamically show sub-forms', () => {
        // FIX: Test now looks for the new @switch syntax.
        expect(formHtml).toContain(`@switch (form.get('item.typeSelector')?.value)`);
        expect(formHtml).toContain(`@case ('Cat')`);
        expect(formHtml).toContain('formGroupName="Cat"');
        expect(formHtml).toContain('formControlName="meowVolume"');

        expect(formHtml).toContain(`@case ('Dog')`);
        expect(formHtml).toContain('formGroupName="Dog"');
        expect(formHtml).toContain('formControlName="barkPitch"');
    });

    it('should generate valueChanges subscription logic in the constructor', () => {
        expect(formTs).toContain("this.form.get('item.typeSelector')!.valueChanges.subscribe(type => {");
        expect(formTs).toContain("if (type === 'Cat') { catForm.enable(); } else { catForm.disable(); catForm.reset(); }");
        expect(formTs).toContain("if (type === 'Dog') { dogForm.enable(); } else { dogForm.disable(); dogForm.reset(); }");
    });
});
