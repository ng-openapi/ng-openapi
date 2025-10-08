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
            // Manually add the admin option from CLI if it exists, overriding the config file
            if (options.admin) {
                // Use a type assertion to add the property
                (config.options as any).admin = true;
            }
            await generateFromConfig(config);
        } else if (options.input) {
            const config: GeneratorConfig = {
                input: options.input, // Can now be a URL or file path
                output: options.output || "./src/generated",
                // Use a type assertion here to add the 'admin' property
                options: {
                    dateType: options.dateType || "Date",
                    enumStyle: "enum",
                    generateEnumBasedOnDescription: true,
                    generateServices: !options.typesOnly,
                    admin: options.admin || false,
                } as any,
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
    } finally {
        const duration = (new Date().getTime() - timestamp) / 1000;
        console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
        process.exit(0);
    }
}

// Common options for both main command and subcommand
const addCommonOptions = (command: Command) => {
    return command
        .option("-c, --config <path>", "Path to configuration file")
        .option("-i, --input <path>", "Path or URL to OpenAPI/Swagger specification (.json, .yaml, .yml)")
        .option("-o, --output <path>", "Output directory", "./src/generated")
        .option("--types-only", "Generate only TypeScript interfaces")
        .option("--date-type <type>", "Date type to use (string | Date)", "Date")
        .option("--admin", "Generate Angular Material admin components for RESTful resources");
};

// Main command
addCommonOptions(program)
    .name("ng-openapi")
    .description(
        "Generate Angular services and types from OpenAPI/Swagger specifications (JSON, YAML, YML) from files or URLs"
    )
    .version(packageJson.version)
    .action(async (options) => {
        await generateFromOptions(options);
    });

// Sub-command for backward compatibility
addCommonOptions(program.command("generate").alias("gen").description("Generate code from OpenAPI/Swagger specification"))
    .action(async (options) => {
        await generateFromOptions(options);
    });

// Add help examples
program.on("--help", () => {
    console.log("");
    console.log("Examples:");
    console.log("  $ ng-openapi -c ./openapi.config.ts");
    console.log("  $ ng-openapi -i ./swagger.json -o ./src/api");
    console.log("  $ ng-openapi -i ./api-spec.yml -o ./src/api --admin");
    console.log("  $ ng-openapi -i https://petstore.swagger.io/v2/swagger.json -o ./src/api");
    console.log("  $ ng-openapi generate -c ./openapi.config.ts --admin");
});

program.parse();
