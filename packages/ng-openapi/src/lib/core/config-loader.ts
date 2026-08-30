import * as fs from "fs";
import * as path from "path";
import { ConfigLoadError, GeneratorConfig, isUrl } from "@ng-openapi/shared";

/**
 * Loads and normalizes a config file.
 *
 * Its own module rather than part of cli.ts: importing cli.ts runs the CLI
 * (commander parses argv at import time), so the config-load contract — which
 * hosts branch on via ConfigLoadError — could not otherwise be tested.
 */
export async function loadConfigFile(configPath: string): Promise<GeneratorConfig> {
    const resolvedPath = path.resolve(configPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new ConfigLoadError(`Configuration file not found: ${resolvedPath}`, resolvedPath);
    }

    try {
        // Inside the try: require.resolve throws for a path that exists but
        // is not resolvable (a directory), which escaped as a bare Error and
        // broke the class-branching contract this function otherwise keeps.
        delete require.cache[require.resolve(resolvedPath)];

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
        throw new ConfigLoadError(`Failed to load configuration file: ${resolvedPath}`, resolvedPath, error);
    }
}

