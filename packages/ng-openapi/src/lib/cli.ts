#!/usr/bin/env node

import { GeneratorConfig, GeneratorConfigOptions } from "@ng-openapi/shared";
import { isUrl } from "@ng-openapi/shared/src/utils/functions/is-url";
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as packageJson from "../../package.json";
import { generateFromConfig } from "./core";

interface CLIOptions {
    config?: string;
    input?: string;
    output?: string;
    typesOnly?: boolean;
    dateType?: "string" | "Date";
    admin?: boolean;
}

async function loadConfigFile(configPath: string): Promise<GeneratorConfig> {
    const resolvedPath = path.resolve(configPath);
    if (!fs.existsSync(resolvedPath)) { throw new Error(`Configuration file not found: ${resolvedPath}`); }
    delete require.cache[require.resolve(resolvedPath)];
    try {
        if (resolvedPath.endsWith(".ts")) { require("ts-node/register"); }
        const configModule = require(resolvedPath);
        const config = configModule.default || configModule.config || configModule;
        if (!config.input || !config.output) { throw new Error('Configuration must include "input" and "output" properties'); }
        const configDir = path.dirname(resolvedPath);
        if (!isUrl(config.input) && !path.isAbsolute(config.input)) { config.input = path.resolve(configDir, config.input); }
        if (!path.isAbsolute(config.output)) { config.output = path.resolve(configDir, config.output); }
        return config;
    } catch (error) { throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : String(error)}`); }
}

async function generateFromOptions(options: CLIOptions): Promise<void> {
    const timestamp = new Date().getTime();
    try {
        if (options.config) {
            const config = await loadConfigFile(options.config);
            if (options.admin) {
                if (!config.options) { config.options = {} as GeneratorConfigOptions; }
                config.options.admin = true;
            }
            await generateFromConfig(config);
        } else if (options.input) {
            const config: GeneratorConfig = {
                input: options.input,
                output: options.output || "./src/generated",
                options: {
                    dateType: options.dateType || "Date",
                    enumStyle: "enum",
                    generateEnumBasedOnDescription: true,
                    generateServices: !options.typesOnly,
                    admin: !!options.admin,
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
    } finally {
        const duration = (new Date().getTime() - timestamp) / 1000;
        console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
        process.exit(0);
    }
}

const program = new Command();
const addCommonOptions = (command: Command) => {
    return command
        .option("-c, --config <path>", "Path to configuration file")
        .option("-i, --input <path>", "Path or URL to OpenAPI/Swagger specification")
        .option("-o, --output <path>", "Output directory", "./src/generated")
        .option("--types-only", "Generate only TypeScript interfaces")
        .option("--date-type <type>", "Date type to use (string | Date)", "Date")
        .option("--admin", "Generate Angular Material admin components for RESTful resources");
};

addCommonOptions(program)
    .name("ng-openapi")
    .description("Generate Angular services and types from OpenAPI/Swagger specifications")
    .version(packageJson.version)
    .action(async (options: CLIOptions) => { await generateFromOptions(options); });

addCommonOptions(program.command("generate").alias("gen").description("Generate code"))
    .action(async (options: CLIOptions) => { await generateFromOptions(options); });

program.parse();
