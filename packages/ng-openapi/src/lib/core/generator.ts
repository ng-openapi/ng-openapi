import { ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { TypeGenerator } from '../generators';
import { DateTransformerGenerator, FileDownloadGenerator, TokenGenerator, MainIndexGenerator } from '../generators/utility';
import { ServiceGenerator, ServiceIndexGenerator } from '../generators/service';
import { ProviderGenerator } from '../generators/utility/provider.generator'; // Add this import
import { GeneratorConfig } from '../types';
import * as fs from 'fs';

/**
 * Generates Angular services and types from a configuration object
 */
export async function generateFromConfig(config: GeneratorConfig): Promise<void> {
    // Validate input file exists
    if (!fs.existsSync(config.input)) {
        throw new Error(`Input file not found: ${config.input}`);
    }

    const outputPath = config.output;
    const generateServices = config.options.generateServices ?? true;

    // Ensure output directory exists
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

        // Use config for type generation
        const typeGenerator = new TypeGenerator(config.input, outputPath, config);
        typeGenerator.generate();
        console.log(`✅ TypeScript interfaces generated`);

        if (generateServices) {
            // Generate tokens first
            const tokenGenerator = new TokenGenerator(project);
            tokenGenerator.generate(outputPath);

            // Generate date transformer if enabled
            if (config.options.dateType === "Date") {
                const dateTransformer = new DateTransformerGenerator(project);
                dateTransformer.generate(outputPath);
                console.log(`✅ Date transformer generated`);
            }

            // Generate file download helper
            const fileDownloadHelper = new FileDownloadGenerator(project);
            fileDownloadHelper.generate(outputPath);
            console.log(`✅ File download helper generated`);

            // Generate services using the refactored ServiceGenerator
            const serviceGenerator = new ServiceGenerator(config.input, project, config);
            serviceGenerator.generate(outputPath);

            // Generate services index file
            const indexGenerator = new ServiceIndexGenerator(project);
            indexGenerator.generateIndex(outputPath);

            console.log(`✅ Angular services generated`);
        }

        // Generate provider functions (always generate, even if services are disabled)
        const providerGenerator = new ProviderGenerator(project, config);
        providerGenerator.generate(outputPath);
        console.log(`✅ Provider functions generated`);

        // Generate main index file (always, regardless of generateServices)
        const mainIndexGenerator = new MainIndexGenerator(project, config);
        mainIndexGenerator.generateMainIndex(outputPath);

        console.log("🎉 Generation completed successfully at:", outputPath);
    } catch (error) {
        if (error instanceof Error) {
            console.error("❌ Error during generation:", error.message);
        } else {
            console.error("❌ Unknown error during generation:", error);
        }
        throw error;
    }
}