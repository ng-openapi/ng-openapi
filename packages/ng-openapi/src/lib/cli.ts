#!/usr/bin/env node

import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import { generateFromConfig } from "./core";
import { GeneratorConfig } from "./types";

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

        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : error}`);
    }
}

async function generateFromOptions(options: any): Promise<void> {
    try {
        if (options.config) {
            // Load configuration from file
            const config = await loadConfigFile(options.config);
            await generateFromConfig(config);
        } else if (options.input) {
            // Use command line options
            const inputPath = path.resolve(options.input);

            if (!fs.existsSync(inputPath)) {
                console.error(`Error: Input file not found: ${inputPath}`);
                process.exit(1);
            }

            const config: GeneratorConfig = {
                input: inputPath,
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
        process.exit(1);
    }
}

// Main command with options (allows: ng-openapi -c config.ts)
program
    .name("ng-openapi")
    .description("Generate Angular services and types from Swagger/OpenAPI spec")
    .version("1.0.0")
    .option("-c, --config <path>", "Path to configuration file")
    .option("-i, --input <path>", "Path to Swagger/OpenAPI specification file")
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
    .description("Generate code from Swagger specification")
    .option("-c, --config <path>", "Path to configuration file")
    .option("-i, --input <path>", "Path to Swagger/OpenAPI specification file")
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
    console.log("  $ ng-openapi generate -c ./openapi.config.ts");
    console.log("  $ ng-openapi generate -i ./api.yaml --types-only");
});

program.parse();
