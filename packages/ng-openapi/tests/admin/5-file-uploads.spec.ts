import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { SwaggerParser } from '@ng-openapi/shared';
import { petstoreUploadSpec } from './specs/test.specs';
import { getTemplate } from '../../src/lib/generators/admin/helpers/template.reader';

describe('Integration: File Uploads Generation', () => {
    let project: Project;
    let formHtml: string;
    let formTs: string;

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: {} } } as any;
        const parser = new SwaggerParser(JSON.parse(petstoreUploadSpec), config);
        const generator = new AdminGenerator(parser, project, config);
        await generator.generate('/output');

        formHtml = project.getSourceFileOrThrow('/output/admin/pets/pet-form/pet-form.component.html').getFullText();
        formTs = project.getSourceFileOrThrow('/output/admin/pets/pet-form/pet-form.component.ts').getFullText();
    });

    it('should generate a file input control in the HTML', () => {
        expect(formHtml).toContain('<input type="file" class="hidden-file-input" #fileInputPhoto');
        expect(formHtml).toContain('<button mat-stroked-button type="button" (click)="fileInputPhoto.click()">');
        expect(formHtml).toContain(`{{ form.get('photo')?.value?.name || "No file chosen" }}`);
    });

    it('should generate the correct FormControl for the file', () => {
        expect(formTs).toContain(`'photo': new FormControl<File | null>(null, { validators: [Validators.required] })`);
    });

    it('should generate the onFileSelected helper method', () => {
        expect(formTs).toContain('onFileSelected(event: Event, controlName: string)');
        expect(formTs).toContain("this.form.get(controlName)!.setValue(file);");
    });

    it('should NOT create special FormData logic in onSubmit', () => {
        const onSubmitMethod = project
            .getSourceFileOrThrow('/output/admin/pets/pet-form/pet-form.component.ts')
            .getClassOrThrow('PetFormComponent')
            .getMethodOrThrow('onSubmit');

        const bodyText = onSubmitMethod.getBodyText();
        expect(bodyText).not.toContain('new FormData()');
        expect(bodyText).toContain('this.form.getRawValue()');
    });
});
