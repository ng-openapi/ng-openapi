import { ModuleKind, Project, ScriptTarget, SourceFile } from "ts-morph";
import { TypeGenerator } from "../generators";
import {
    BaseInterceptorGenerator,
    DateTransformerGenerator,
    FileDownloadGenerator,
    MainIndexGenerator,
    TokenGenerator
} from "../generators/utility";
import { ServiceGenerator, ServiceIndexGenerator } from "../generators/service";
import { ProviderGenerator } from "../generators/utility";
import { GeneratorConfig, IPluginGeneratorClass, SwaggerParser } from "@ng-openapi/shared";
import * as fs from "fs";
import * as path from "path";
import { isUrl } from "@ng-openapi/shared/src/utils/functions/is-url";

/**
 * Validates input (file or URL)
 */
export function validateInput(inputPath: string): void {
    if (isUrl(inputPath)) {
        return;
    }

    // For local files, check existence and extension
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    const extension = path.extname(inputPath).toLowerCase();
    const supportedExtensions = [".json", ".yaml", ".yml"];

    if (!supportedExtensions.includes(extension)) {
        throw new Error(
            `Failed to parse ${extension || "specification"}. Supported formats are .json, .yaml, and .yml.`
        );
    }
}

/**
 * Generates Angular services and types from a configuration object
 */
export async function generateFromConfig(config: GeneratorConfig): Promise<void> {
    // Validate input (file or URL)
    validateInput(config.input);

    const outputPath = config.output;
    const generateServices = config.options.generateServices ?? true;
    const inputType = isUrl(config.input) ? "URL" : "file";

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

        console.log(`📡 Processing OpenAPI specification from ${inputType}: ${config.input}`);
        const swaggerParser = await SwaggerParser.create(config.input, config);

        // Use config for type generation - TypeGenerator now handles both files and URLs
        const typeGenerator = new TypeGenerator(swaggerParser, project, config, outputPath);
        await typeGenerator.generate();
        console.log(`✅ TypeScript interfaces generated`);

        if (generateServices) {
            // Generate tokens first
            const tokenGenerator = new TokenGenerator(project, config.clientName);
            tokenGenerator.generate(outputPath);

            // Generate date transformer if enabled
            if (config.options.dateType === "Date") {
                const dateTransformer = new DateTransformerGenerator(project);
                dateTransformer.generate(outputPath);
            }

            // Generate file download helper
            const fileDownloadHelper = new FileDownloadGenerator(project);
            fileDownloadHelper.generate(outputPath);

            // Generate services using the refactored ServiceGenerator
            const serviceGenerator = new ServiceGenerator(swaggerParser, project, config);
            await serviceGenerator.generate(outputPath);

            // Generate services index file
            const indexGenerator = new ServiceIndexGenerator(project);
            indexGenerator.generateIndex(outputPath);

            console.log(`✅ Angular services generated`);

            // Generate provider functions (always generate, even if services are disabled)
            const providerGenerator = new ProviderGenerator(project, config);
            providerGenerator.generate(outputPath);

            const baseInterceptorGenerator = new BaseInterceptorGenerator(project, config.clientName);
            baseInterceptorGenerator.generate(outputPath);
        }

        if (config.plugins?.length) {
            for (const plugin of config.plugins) {
                const generatorClass = plugin as IPluginGeneratorClass;
                const pluginGenerator = new generatorClass(swaggerParser, project, config);
                await pluginGenerator.generate(outputPath);
            }
            console.log(`✅ Plugins are generated`);
        }

        // Generate main index file (always, regardless of generateServices)
        const mainIndexGenerator = new MainIndexGenerator(project, config);
        mainIndexGenerator.generateMainIndex(outputPath);

        const sourceInfo = `from ${inputType}: ${config.input}`;
        if (config.clientName) {
            console.log(`🎉 ${config.clientName} Generation completed successfully ${sourceInfo} -> ${outputPath}`);
        } else {
            console.log(`🎉 Generation completed successfully ${sourceInfo} -> ${outputPath}`);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error("❌ Error during generation:", error.message);

            // Provide helpful hints for common URL-related errors
            if (error.message.includes("fetch") || error.message.includes("Failed to fetch")) {
                console.error(
                    "💡 Tip: Make sure the URL is accessible and returns a valid OpenAPI/Swagger specification"
                );
                console.error("💡 Alternative: Download the specification file locally and use the file path instead");
            }
        } else {
            console.error("❌ Unknown error during generation:", error);
        }
        throw error;
    }
}
