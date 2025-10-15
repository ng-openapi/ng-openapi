import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { SwaggerParser } from '@ng-openapi/shared';
import { advancedValidationSpec } from './specs/test.specs';
import { getTemplate } from '../../src/lib/generators/admin/helpers/template.reader';

describe('Integration: Advanced Validation Generation', () => {
    let project: Project;
    let formTs: string;
    let customValidatorsTs: string;

    beforeAll(async () => {
        project = new Project({ useInMemoryFileSystem: true });
        const config = { options: { admin: {} } } as any;
        const parser = new SwaggerParser(JSON.parse(advancedValidationSpec), config);
        const generator = new AdminGenerator(parser, project, config);
        await generator.generate('/output');

        formTs = project.getSourceFileOrThrow('/output/admin/items/item-form/item-form.component.ts').getFullText();
        customValidatorsTs = project.getSourceFileOrThrow('/output/admin/helpers/custom-validators.ts').getFullText();
    });

    it('should generate a custom validators file', () => {
        const templateContent = getTemplate('custom-validators.ts.template');
        expect(customValidatorsTs).toBe(templateContent);
    });

    it('should import CustomValidators in the form component', () => {
        expect(formTs).toContain(`import { CustomValidators } from "../../helpers/custom-validators";`);
    });

    it('should apply built-in validators for numbers and arrays', () => {
        // Numbers: minimum, maximum
        expect(formTs).toContain(`'quantity': new FormControl<CreateItem['quantity']>(0, { validators: [Validators.required, Validators.min(1), Validators.max(100)], nonNullable: true })`);

        // Arrays: minItems, maxItems
        expect(formTs).toContain(`'tags': new FormArray([], { validators: [Validators.minLength(2), Validators.maxLength(5)] })`);
    });

    it('should apply custom validators for numbers', () => {
        // Numbers: exclusiveMinimum, exclusiveMaximum, multipleOf
        expect(formTs).toContain(`'price': new FormControl<CreateItem['price'] | null>(null, { validators: [CustomValidators.exclusiveMin(0), CustomValidators.exclusiveMax(1000)] })`);
        expect(formTs).toContain(`'step': new FormControl<CreateItem['step'] | null>(null, { validators: [CustomValidators.multipleOf(5)] })`);
    });

    it('should apply custom validators for arrays', () => {
        // Arrays: uniqueItems
        expect(formTs).toContain(`'categories': new FormArray([], { validators: [CustomValidators.uniqueItems()] })`);
    });
});
