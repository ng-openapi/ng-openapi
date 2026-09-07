#!/usr/bin/env node

import { GeneratorConfig, isUrl, SpecLoadError } from "@ng-openapi/shared";
import { Command } from "commander";
import * as packageJson from "../../package.json";
import { generateFromConfig, loadConfigFile, Reporter } from "./core";

const program = new Command();

/**
 * Console presentation of generation progress. This is the only place in the
 * workspace that prints — the orchestrator and generators stay silent.
 */
function createConsoleReporter(config: GeneratorConfig): Reporter {
    const inputType = isUrl(config.input) ? "URL" : "file";
    return {
        onPhase(phase) {
            switch (phase) {
                case "processing-spec":
                    console.log(`📡 Processing OpenAPI specification from ${inputType}: ${config.input}`);
                    break;
                case "types-generated":
                    console.log("✅ TypeScript interfaces generated");
                    break;
                case "services-generated":
                    console.log("✅ Angular services generated");
                    break;
                case "plugins-generated":
                    console.log("✅ Plugins are generated");
                    break;
            }
        },
        onWarning(message) {
            console.warn(`⚠️ ${message}`);
        },
    };
}

/** Returns the number of warnings, so the final line can say so. */
async function runGeneration(config: GeneratorConfig): Promise<number> {
    const result = await generateFromConfig(config, createConsoleReporter(config));
    const inputType = isUrl(config.input) ? "URL" : "file";
    const sourceInfo = `from ${inputType}: ${config.input}`;
    const clientPrefix = result.client ? `${result.client} ` : "";
    // Warnings describe spec content that was dropped, merged or renamed —
    // an unconditional "successfully" after twelve of them misreads the run.
    const outcome =
        result.warnings.length === 0
            ? "completed successfully"
            : `completed with ${countWarnings(result.warnings.length)}`;
    console.log(`🎉 ${clientPrefix}Generation ${outcome} ${sourceInfo} -> ${config.output}`);
    return result.warnings.length;
}

function countWarnings(count: number): string {
    return `${count} warning${count === 1 ? "" : "s"}`;
}

interface CliOptions {
    config?: string;
    input?: string;
    output?: string;
    typesOnly?: boolean;
    /** Free-form from the flag; validateGeneratorConfig rejects invalid values with a clear message. */
    dateType?: string;
}

async function generateFromOptions(options: CliOptions): Promise<void> {
    const timestamp = new Date().getTime();
    let warningCount = 0;
    try {
        if (options.config) {
            const config = await loadConfigFile(options.config);
            warningCount = await runGeneration(config);
        } else if (options.input) {
            const config: GeneratorConfig = {
                input: options.input, // Can now be a URL or file path
                output: options.output || "./src/generated",
                options: {
                    // Passed through unchecked on purpose: validateGeneratorConfig
                    // rejects anything but "string" | "Date" with an actionable error
                    dateType: (options.dateType || "Date") as GeneratorConfig["options"]["dateType"],
                    enumStyle: "enum",
                    generateEnumBasedOnDescription: true,
                    generateServices: !options.typesOnly,
                },
            };

            warningCount = await runGeneration(config);
        } else {
            console.error("Error: Either --config or --input option is required");
            // help({ error: true }) prints to stderr and exits non-zero;
            // plain help() would exit 0 before a process.exit(1) could run
            program.help({ error: true });
        }

        if (warningCount === 0) {
            console.log("✨ Generation completed successfully!");
        } else {
            console.log(
                `✨ Generation completed with ${countWarnings(warningCount)} — see above; each describes spec content that was not generated as written.`,
            );
        }
    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : error);

        // The underlying failure is often the only actionable part (an ENOENT
        // path, a JSON parse position), and it was being collected on `cause`
        // and then never shown. Capped because a cause chain can be cyclic —
        // and the cap says so rather than trailing off silently.
        const MAX_CAUSES = 3;
        let cause = (error as { cause?: unknown } | undefined)?.cause;
        for (let depth = 0; cause !== undefined && cause !== null; depth++) {
            if (depth === MAX_CAUSES) {
                console.error("   … further causes omitted");
                break;
            }
            console.error("   caused by:", cause instanceof Error ? cause.message : cause);
            cause = (cause as { cause?: unknown }).cause;
        }

        // Typed hint mapping: branch on the error class, never on message text
        if (error instanceof SpecLoadError && isUrl(error.source)) {
            console.error("💡 Tip: Make sure the URL is accessible and returns a valid OpenAPI/Swagger specification");
            console.error("💡 Alternative: Download the specification file locally and use the file path instead");
        }
        // exitCode instead of process.exit(): lets the event loop drain (no
        // truncated piped output) and can't be short-circuited by refactors
        process.exitCode = 1;
    } finally {
        const duration = (new Date().getTime() - timestamp) / 1000;
        console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
    }
}

// Main command with options (allows: ng-openapi -c config.ts)
program
    .name("ng-openapi")
    .description(
        "Generate Angular services and types from OpenAPI/Swagger specifications (JSON, YAML, YML) from files or URLs",
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
