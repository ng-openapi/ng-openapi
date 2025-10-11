import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { AdminGenerator, TypeGenerator } from '../generators';
import {
    BaseInterceptorGenerator,
    DateTransformerGenerator,
    FileDownloadGenerator,
    HttpParamsBuilderGenerator,
    MainIndexGenerator,
    ProviderGenerator,
    TokenGenerator
} from '../generators/utility';
import { ServiceGenerator, ServiceIndexGenerator } from '../generators/service';
import { GeneratorConfig, IPluginGeneratorClass, SwaggerParser } from '@ng-openapi/shared';
import * as fs from 'fs';
import * as path from 'path';
import { isUrl } from '@ng-openapi/shared/src/utils/functions/is-url';

export function validateInput(inputPath: string): void { /* ... unchanged ... */ }

export async function generateFromConfig(config: GeneratorConfig): Promise<void> {
    validateInput(config.input);

    const outputPath = config.output;
    const generateServices = config.options.generateServices ?? true;
    const inputType = isUrl(config.input) ? "URL" : "file";

    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    try {
        const project = new Project({
            compilerOptions: {
                declaration: true,
                target: ScriptTarget.ES2022,
                module: ModuleKind.Preserve,
                strict: true,
                ...config.compilerOptions,
            },
        });

        console.log(`📡 Processing OpenAPI specification from ${inputType}: ${config.input}`);
        const swaggerParser = await SwaggerParser.create(config.input, config);

        const typeGenerator = new TypeGenerator(swaggerParser, project, config, outputPath);
        await typeGenerator.generate();
        console.log(`✅ TypeScript interfaces generated`);

        if (generateServices) {
            const tokenGenerator = new TokenGenerator(project, config.clientName);
            tokenGenerator.generate(outputPath);

            if (config.options.dateType === "Date") {
                const dateTransformer = new DateTransformerGenerator(project);
                dateTransformer.generate(outputPath);
            }

            const fileDownloadHelper = new FileDownloadGenerator(project);
            fileDownloadHelper.generate(outputPath);

            const httpParamsBuilderGenerator = new HttpParamsBuilderGenerator(project);
            httpParamsBuilderGenerator.generate(outputPath);

            const providerGenerator = new ProviderGenerator(project, config);
            providerGenerator.generate(outputPath);

            const baseInterceptorGenerator = new BaseInterceptorGenerator(project, config.clientName);
            baseInterceptorGenerator.generate(outputPath);

            const serviceGenerator = new ServiceGenerator(swaggerParser, project, config);
            await serviceGenerator.generate(outputPath);

            const indexGenerator = new ServiceIndexGenerator(project);
            indexGenerator.generateIndex(outputPath);

            console.log(`✅ Angular services generated`);

            // ##### THIS IS THE CRUCIAL MISSING BLOCK #####
            if (config.options.admin) {
                const adminGenerator = new AdminGenerator(swaggerParser, project, config);
                await adminGenerator.generate(outputPath);
                console.log(`✅ Angular admin components generated`);
            }
            // ##### END OF CRUCIAL MISSING BLOCK #####
        }

        if (config.plugins?.length) {
            for (const plugin of config.plugins) {
                const generatorClass = plugin as IPluginGeneratorClass;
                const pluginGenerator = new generatorClass(swaggerParser, project, config);
                await pluginGenerator.generate(outputPath);
            }
            console.log(`✅ Plugins are generated`);
        }

        const mainIndexGenerator = new MainIndexGenerator(project, config);
        mainIndexGenerator.generateMainIndex(outputPath);

        console.log(`🎉 Generation completed successfully -> ${outputPath}`);
    } catch (error) {
        console.error("❌ Error during generation:", error instanceof Error ? error.message : error);
        throw error;
    }
}
