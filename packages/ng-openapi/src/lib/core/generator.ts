import { ModuleKind, Project, ScriptTarget } from "ts-morph";
import { TypeGenerator } from "../generators";
import {
    BaseInterceptorGenerator,
    DateTransformerGenerator,
    FileDownloadGenerator,
    HttpParamsBuilderGenerator,
    MainIndexGenerator,
    ProviderGenerator,
    TokenGenerator,
} from "../generators/utility";
import { ServiceGenerator, ServiceIndexGenerator } from "../generators/service";
import { GeneratorConfig, isUrl, SpecLoadError, SpecParseError, SwaggerParser } from "@ng-openapi/shared";
import { validateGeneratorConfig } from "./config-validation";
import { GenerationResult, Reporter } from "./reporter";
import * as fs from "fs";
import * as path from "path";

/**
 * Validates input (file or URL).
 *
 * @throws SpecLoadError when a local input file is missing or has an
 *   unsupported extension. URLs are validated by the loader when fetched.
 */
export function validateInput(inputPath: string): void {
    if (isUrl(inputPath)) {
        return;
    }

    // For local files, check existence and extension
    if (!fs.existsSync(inputPath)) {
        throw new SpecLoadError(`Input file not found: ${inputPath}`, inputPath);
    }

    const extension = path.extname(inputPath).toLowerCase();
    const supportedExtensions = [".json", ".yaml", ".yml"];

    if (!supportedExtensions.includes(extension)) {
        throw new SpecLoadError(
            `Failed to parse ${extension || "specification"}. Supported formats are .json, .yaml, and .yml.`,
            inputPath,
        );
    }
}

/**
 * Generates Angular services and types from a configuration object.
 *
 * Pure orchestration: no logging, no process concerns. Progress and warnings
 * are surfaced through the optional Reporter and the returned
 * GenerationResult; presentation (emojis, hints, exit codes) is the CLI's job.
 *
 * @throws ConfigValidationError when the config is structurally invalid.
 * @throws SpecLoadError when the input file/URL cannot be read.
 * @throws SpecParseError when the spec cannot be parsed, has an unsupported
 *   version, or is rejected by the config's `validateInput` hook.
 */
export async function generateFromConfig(config: GeneratorConfig, reporter: Reporter = {}): Promise<GenerationResult> {
    const startedAt = Date.now();

    // Fail fast on structurally invalid configs (JS callers / config files
    // bypass the compile-time types entirely)
    validateGeneratorConfig(config);

    // Validate input (file or URL)
    validateInput(config.input);

    const outputPath = config.output;
    const generateServices = config.options.generateServices ?? true;

    const warnings: string[] = [];
    const onWarning = (message: string): void => {
        warnings.push(message);
        reporter.onWarning?.(message);
    };

    // Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    const project = new Project({
        compilerOptions: {
            declaration: true,
            target: ScriptTarget.ES2022,
            module: ModuleKind.Preserve,
            strict: true,
            ...config.compilerOptions,
        },
    });

    reporter.onPhase?.("processing-spec");
    const swaggerParser = await SwaggerParser.create(config.input, config);

    // Guard once here instead of in every generator/plugin constructor
    if (!swaggerParser.isValidSpec()) {
        const versionInfo = swaggerParser.getSpecVersion();
        throw new SpecParseError(
            `Invalid or unsupported specification format. ` +
                `Expected OpenAPI 3.x or Swagger 2.x. ` +
                `${versionInfo ? `Found: ${versionInfo.type} ${versionInfo.version}` : "No version info found"}`,
            config.input,
        );
    }
    const normalizedSpec = swaggerParser.getNormalizedSpec();

    const typeGenerator = new TypeGenerator(swaggerParser, project, config, outputPath, onWarning);
    await typeGenerator.generate();
    reporter.onPhase?.("types-generated");

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

        // Generate HttpParamsBuilder
        const httpParamsBuilderGenerator = new HttpParamsBuilderGenerator(project);
        httpParamsBuilderGenerator.generate(outputPath);

        // Generate provider functions (always generate, even if services are disabled)
        const providerGenerator = new ProviderGenerator(project, config);
        providerGenerator.generate(outputPath);

        const baseInterceptorGenerator = new BaseInterceptorGenerator(project, config.clientName);
        baseInterceptorGenerator.generate(outputPath);

        // Generate services using the refactored ServiceGenerator
        const serviceGenerator = new ServiceGenerator(swaggerParser, project, config, onWarning);
        await serviceGenerator.generate(outputPath);

        // Generate services index file
        const indexGenerator = new ServiceIndexGenerator(project);
        indexGenerator.generateIndex(outputPath);

        reporter.onPhase?.("services-generated");
    }

    if (config.plugins?.length) {
        for (const plugin of config.plugins) {
            const pluginGenerator = new plugin({ spec: normalizedSpec, project, config, onWarning });
            await pluginGenerator.generate(outputPath);
        }
        reporter.onPhase?.("plugins-generated");
    }

    // Generate main index file (always, regardless of generateServices)
    const mainIndexGenerator = new MainIndexGenerator(project, config);
    mainIndexGenerator.generateMainIndex(outputPath);

    return {
        client: config.clientName,
        filesWritten: project.getSourceFiles().map((sourceFile) => sourceFile.getFilePath() as string),
        warnings,
        durationMs: Date.now() - startedAt,
    };
}
