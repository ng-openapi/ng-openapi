import {ModuleKind, Project, ScriptTarget} from "ts-morph";
import {GENERATOR_CONFIG} from "../config";
import {TypeGenerator} from "../generators";
import {DateTransformerGenerator, FileDownloadGenerator, TokenGenerator} from "../generators/utility";
import {ServiceGenerator, ServiceIndexGenerator} from "../generators/service";

export function generateFromSwagger(
    swaggerPath: string,
): void {
    const outputPath = GENERATOR_CONFIG.output;
    const generateServices = GENERATOR_CONFIG.options.generateServices ?? true;
    try {
        const project = new Project({
            compilerOptions: {
                declaration: true,
                target: ScriptTarget.ES2022,
                module: ModuleKind.Preserve,
                strict: true,
                ...GENERATOR_CONFIG.compilerOptions
            },
        });

        const typeGenerator = new TypeGenerator(swaggerPath, outputPath);
        typeGenerator.generate();
        console.log(`✅ TypeScript interfaces generated`);

        if (generateServices) {
            // Generate tokens first
            const tokenGenerator = new TokenGenerator(project);
            tokenGenerator.generate(outputPath);

            // Generate date transformer if enabled
            if (GENERATOR_CONFIG.options.dateType === 'Date') {
                const dateTransformer = new DateTransformerGenerator(project);
                dateTransformer.generate(outputPath);
                console.log(`✅ Date transformer generated`);
            }

            // Generate file download helper
            const fileDownloadHelper = new FileDownloadGenerator(project);
            fileDownloadHelper.generate(outputPath);
            console.log(`✅ File download helper generated`);

            const serviceGenerator = new ServiceGenerator(swaggerPath, project);
            serviceGenerator.generate(outputPath);

            // Generate index file
            const indexGenerator = new ServiceIndexGenerator(project);
            indexGenerator.generateIndex(outputPath);

            console.log(`✅ Angular services generated`);
        }

        console.log('🎉 Generation completed successfully at:', outputPath);
    } catch (error) {
        if (error instanceof Error) {
            console.error('❌ Error during generation:', error.message);
        } else {
            console.error('❌ Unknown error during generation:', error);
        }
        process.exit(1);
    }
}

// If running directly
if (require.main === module) {
    const swaggerPath = process.argv[2] || './swagger.json';

    generateFromSwagger(swaggerPath);
}