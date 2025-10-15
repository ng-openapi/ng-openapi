// packages/ng-openapi/src/lib/core/generator.ts

import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { AdminGenerator, TypeGenerator } from '../generators';
import {
    AuthInterceptorGenerator,
    AuthTokensGenerator,
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

export async function generateFromConfig(config: GeneratorConfig, project?: Project): Promise<void> {
    const inputPath = config.input; // Keep original for logging
    if (!project && !isUrl(inputPath) && !fs.existsSync(inputPath)) {
        throw new Error(`Input file not found at ${inputPath}`);
    }

    const outputPath = config.output;
    const generateServices = config.options.generateServices ?? true;
    const inputType = isUrl(inputPath) ? "URL" : "file";

    if (!project && !fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    try {
        const activeProject = project || new Project({
            compilerOptions: {
                declaration: true,
                target: ScriptTarget.ES2022,
                module: ModuleKind.ESNext,
                strict: true,
                moduleResolution: 2, // Bundler
                ...config.compilerOptions,
            },
        });

        if (!project && !isUrl(inputPath)) {
            activeProject.addSourceFileAtPath(inputPath);
        }

        console.log(`📡 Processing OpenAPI specification from ${inputType}: ${inputPath}`);
        const swaggerParser = await SwaggerParser.create(inputPath, config, activeProject);

        const typeGenerator = new TypeGenerator(swaggerParser, activeProject, config, outputPath);
        await typeGenerator.generate();
        console.log(`✅ TypeScript interfaces generated`);

        if (generateServices) {
            const authTokensGenerator = new AuthTokensGenerator(activeProject);
            authTokensGenerator.generate(outputPath);

            const authInterceptorGenerator = new AuthInterceptorGenerator(swaggerParser, activeProject);
            authInterceptorGenerator.generate(outputPath);

            const tokenGenerator = new TokenGenerator(activeProject, config.clientName);
            tokenGenerator.generate(outputPath);

            if (config.options.dateType === "Date") {
                const dateTransformer = new DateTransformerGenerator(activeProject);
                dateTransformer.generate(outputPath);
            }

            const fileDownloadHelper = new FileDownloadGenerator(activeProject);
            fileDownloadHelper.generate(outputPath);

            const httpParamsBuilderGenerator = new HttpParamsBuilderGenerator(activeProject);
            httpParamsBuilderGenerator.generate(outputPath);

            const providerGenerator = new ProviderGenerator(activeProject, config, swaggerParser);
            providerGenerator.generate(outputPath);

            const baseInterceptorGenerator = new BaseInterceptorGenerator(activeProject, config.clientName);
            baseInterceptorGenerator.generate(outputPath);

            const serviceGenerator = new ServiceGenerator(swaggerParser, activeProject, config);
            await serviceGenerator.generate(outputPath);

            const indexGenerator = new ServiceIndexGenerator(activeProject);
            indexGenerator.generateIndex(outputPath);

            console.log(`✅ Angular services generated`);

            activeProject.resolveSourceFileDependencies();

            if (config.options.admin) {
                const adminGenerator = new AdminGenerator(swaggerParser, activeProject, config);
                await adminGenerator.generate(outputPath);
                console.log(`✅ Angular admin components generated`);
            }
        }

        if (config.plugins?.length) {
            for (const plugin of config.plugins) {
                const generatorClass = plugin as IPluginGeneratorClass;
                const pluginGenerator = new generatorClass(swaggerParser, activeProject, config);
                await pluginGenerator.generate(outputPath);
            }
            console.log(`✅ Plugins are generated`);
        }

        const mainIndexGenerator = new MainIndexGenerator(activeProject, config);
        mainIndexGenerator.generateMainIndex(outputPath);

        if (!project) { // Only save if we created the project internally
            await activeProject.save();
        }

        console.log(`🎉 Generation completed successfully -> ${outputPath}`);
    } catch (error) {
        console.error("❌ Error during generation:", error instanceof Error ? error.message : error);
        throw error;
    }
}
