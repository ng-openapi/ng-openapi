import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { AdminGenerator } from '../../src/lib/generators/admin/admin.generator';
import { GeneratorConfig, SwaggerParser } from '@ng-openapi/shared';
import { basicControlsSpec, defaultValueSpec } from './specs/test.specs';

describe('Integration: Form Controls Generation', () => {
    describe('Individual Control Types', () => {
        let project: Project;
        let formHtml: string;
        let formTs: string;

        beforeAll(async () => {
            project = new Project({ useInMemoryFileSystem: true });
            const config: Partial<GeneratorConfig> = { options: { admin: true } };
            const parser = new SwaggerParser(JSON.parse(basicControlsSpec), config as GeneratorConfig);
            const generator = new AdminGenerator(parser, project, config as GeneratorConfig);
            await generator.generate('/output');

            formHtml = project.getSourceFileOrThrow('/output/admin/widgets/widget-form/widget-form.component.html').getFullText();
            formTs = project.getSourceFileOrThrow('/output/admin/widgets/widget-form/widget-form.component.ts').getFullText();
        });

        it('should generate a MatDatepicker', () => expect(formHtml).toContain('mat-datepicker'));
        it('should generate a MatButtonToggleGroup', () => expect(formHtml).toContain('mat-button-toggle-group'));
        it('should generate a MatRadioGroup for small enums', () => expect(formHtml).toContain('formControlName="priority"'));
        it('should generate a MatSelect for large enums', () => expect(formHtml).toContain('formControlName="status"'));
        it('should generate a MatChipList', () => expect(formHtml).toContain('mat-chip-grid'));
        it('should generate a MatSlider', () => expect(formHtml).toContain('mat-slider'));
        it('should generate a textarea', () => expect(formHtml).toContain('<textarea matInput'));
        it('should generate validators', () => expect(formTs).toContain('Validators.minLength(3)'));
    });

    describe('Default Value Generation', () => {
        let project: Project;
        let formTs: string;

        beforeAll(async () => {
            project = new Project({ useInMemoryFileSystem: true });
            const config: Partial<GeneratorConfig> = { options: { admin: true } };
            const parser = new SwaggerParser(JSON.parse(defaultValueSpec), config as GeneratorConfig);
            const generator = new AdminGenerator(parser, project, config as GeneratorConfig);
            await generator.generate('/output');
            formTs = project.getSourceFileOrThrow('/output/admin/configs/config-form/config-form.component.ts').getFullText();
        });

        it('should use default for string', () => expect(formTs).toContain(`'name': new FormControl<CreateConfig['name']>("Default Name"`));
        it('should use default for number', () => expect(formTs).toContain(`'retries': new FormControl<CreateConfig['retries']>(3`));
        it('should use default for boolean', () => expect(formTs).toContain(`'isEnabled': new FormControl<CreateConfig['isEnabled']>(true`));

        it('should use default for array', () => {
            // This robust test checks for key parts instead of an exact, brittle match.
            expect(formTs).toContain(`'flags': new FormArray(`);
            expect(formTs).toContain(`new FormControl("A")`);
            expect(formTs).toContain(`new FormControl("B")`);
        });

        it('should use null when no default', () => expect(formTs).toContain(`'unassigned': new FormControl<CreateConfig['unassigned'] | null>(null`));
    });
});
