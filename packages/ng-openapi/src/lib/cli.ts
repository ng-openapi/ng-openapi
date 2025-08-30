#!/usr/bin/env node

import { GeneratorConfig } from "@ng-openapi/shared";
import { isUrl } from "@ng-openapi/shared/src/utils/functions/is-url";
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as packageJson from "../../package.json";
import { generateFromConfig } from "./core";

const program = new Command();

async function loadConfigFile(configPath: string): Promise<GeneratorConfig> {
    const resolvedPath = path.resolve(configPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
    }

    // Clear require cache to ensure fresh load
    delete require.cache[require.resolve(resolvedPath)];

    try {
        // Handle both .ts and .js files
        if (resolvedPath.endsWith(".ts")) {
            // Use ts-node to load TypeScript config files
            require("ts-node/register");
        }

        const configModule = require(resolvedPath);

        // Handle different export styles
        const config = configModule.default || configModule.config || configModule;

        if (!config.input || !config.output) {
            throw new Error('Configuration must include "input" and "output" properties');
        }

        // Resolve relative paths relative to the config file directory
        const configDir = path.dirname(resolvedPath);

        // Only resolve input if it's not a URL and is a relative path
        if (!isUrl(config.input) && !path.isAbsolute(config.input)) {
            config.input = path.resolve(configDir, config.input);
        }

        // Only resolve output if it's a relative path
        if (!path.isAbsolute(config.output)) {
            config.output = path.resolve(configDir, config.output);
        }

        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : error}`);
    }
}

async function generateFromOptions(options: any): Promise<void> {
    const timestamp = new Date().getTime();
    try {
        if (options.config) {
            const config = await loadConfigFile(options.config);
            await generateFromConfig(config);
        } else if (options.input) {
            const config: GeneratorConfig = {
                input: options.input, // Can now be a URL or file path
                output: options.output || "./src/generated",
                options: {
                    dateType: options.dateType || "Date",
                    enumStyle: "enum",
                    generateEnumBasedOnDescription: true,
                    generateServices: !options.typesOnly,
                },
            };

            await generateFromConfig(config);
        } else {
            console.error("Error: Either --config or --input option is required");
            program.help();
            process.exit(1);
        }

        console.log("✨ Generation completed successfully!");
    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : error);
    } finally {
        const duration = (new Date().getTime() - timestamp) / 1000;
        console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
        process.exit(1);
    }
}

// Main command with options (allows: ng-openapi -c config.ts)
program
    .name("ng-openapi")
    .description(
        "Generate Angular services and types from OpenAPI/Swagger specifications (JSON, YAML, YML) from files or URLs"
    )
    .version(packageJson.version)
    .option("-c, --config <path>", "Path to configuration file")
    .option("-i, --input <path>", "Path or URL to OpenAPI/Swagger specification (.json, .yaml, .yml)")
    .option("-o, --output <path>", "Output directory", "./src/generated")
    .option("--types-only", "Generate only TypeScript interfaces")
    .option("--date-type <type>", "Date type to use (string | Date)", "Date")
    .action(async (options) => {
        await generateFromOptions(options);
    });

// Sub-command for backward compatibility (allows: ng-openapi generate -c config.ts)
program
    .command("generate")
    .alias("gen")
    .description("Generate code from OpenAPI/Swagger specification")
    .option("-c, --config <path>", "Path to configuration file")
    .option("-i, --input <path>", "Path or URL to OpenAPI/Swagger specification (.json, .yaml, .yml)")
    .option("-o, --output <path>", "Output directory", "./src/generated")
    .option("--types-only", "Generate only TypeScript interfaces")
    .option("--date-type <type>", "Date type to use (string | Date)", "Date")
    .action(async (options) => {
        await generateFromOptions(options);
    });

// Add help examples
program.on("--help", () => {
    console.log("");
    console.log("Examples:");
    console.log("  $ ng-openapi -c ./openapi.config.ts");
    console.log("  $ ng-openapi -i ./swagger.json -o ./src/api");
    console.log("  $ ng-openapi -i ./openapi.yaml -o ./src/api");
    console.log("  $ ng-openapi -i ./api-spec.yml -o ./src/api");
    console.log("  $ ng-openapi -i https://api.example.com/openapi.json -o ./src/api");
    console.log("  $ ng-openapi -i https://petstore.swagger.io/v2/swagger.json -o ./src/api");
    console.log("  $ ng-openapi generate -c ./openapi.config.ts");
    console.log("  $ ng-openapi generate -i https://api.example.com/swagger.yaml --types-only");
});

program.parse();
