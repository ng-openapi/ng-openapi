import { ModuleKind, Project, ScriptTarget } from "ts-morph";
import { TypeGenerator } from "../generators";
import {
    BaseInterceptorGenerator,
    DateTransformerGenerator,
    FileDownloadGenerator,
    MainIndexGenerator,
    TokenGenerator
} from "../generators/utility";
import { ServiceGenerator, ServiceIndexGenerator } from "../generators/service";
import { ProviderGenerator } from "../generators/utility/provider.generator";
import { GeneratorConfig, IPluginGeneratorClass } from "@ng-openapi/shared";
import * as fs from "fs";

/**
 * Determines if input is a URL
 */
function isUrl(input: string): boolean {
    try {
        new URL(input);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validates input (file or URL)
 */
function validateInput(input: string): void {
    if (isUrl(input)) {
        // For URLs, validate the protocol
        const url = new URL(input);
        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error(`Unsupported URL protocol: ${url.protocol}. Only HTTP and HTTPS are supported.`);
        }
    } else {
        // For files, check existence
        if (!fs.existsSync(input)) {
            throw new Error(`Input file not found: ${input}`);
        }
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

        // Use config for type generation - TypeGenerator now handles both files and URLs
        const typeGenerator = await TypeGenerator.create(config.input, outputPath, config);
        typeGenerator.generate();
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
            const serviceGenerator = await ServiceGenerator.create(config.input, project, config);
            serviceGenerator.generate(outputPath);

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
                const PluginClass = plugin as unknown as IPluginGeneratorClass;
                const pluginGenerator = await PluginClass.create(config.input, project, config);
                pluginGenerator.generate(outputPath);
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
