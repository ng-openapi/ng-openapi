import { describe, it, expect, beforeAll } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@ng-openapi/shared';

import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { petstoreUploadSpec } from './specs/test.specs';

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
        // Check for the hidden file input itself
        expect(formHtml).toContain('<input type="file" class="hidden-file-input" #fileInputPhoto');
        // Check for the button that triggers it
        expect(formHtml).toContain('<button mat-stroked-button type="button" (click)="fileInputPhoto.click()">');
        // Check for the file name display
        // FIX: Use optional chaining `?` to match the safer generated code.
        expect(formHtml).toContain(`{{ form.get('photo')?.value?.name || "No file chosen" }}`);
    });

    it('should generate the correct FormControl for the file', () => {
        // FIX: Add the expected validators object to the assertion.
        expect(formTs).toContain(`'photo': new FormControl<File | null>(null, { validators: [Validators.required] })`);
    });

    it('should generate the onFileSelected helper method', () => {
        expect(formTs).toContain('onFileSelected(event: Event, controlName: string): void {');
        expect(formTs).toContain("this.form.get(controlName)!.setValue(file);");
    });

    it('should NOT create special FormData logic in onSubmit', () => {
        // The core service generator and Angular's HttpClient handle multipart serialization automatically
        // when a `File` object is present in the request body object. We just need to ensure
        // the form value is passed directly.
        const onSubmitMethod = project
            .getSourceFileOrThrow('/output/admin/pets/pet-form/pet-form.component.ts')
            .getClassOrThrow('PetFormComponent')
            .getMethodOrThrow('onSubmit');

        const bodyText = onSubmitMethod.getBodyText();
        expect(bodyText).not.toContain('new FormData()');
        expect(bodyText).toContain('const formValue = this.form.getRawValue() as CreatePet;');
        expect(bodyText).toContain(`this.svc.createPet({ body: formValue } as any)`);
    });
});
