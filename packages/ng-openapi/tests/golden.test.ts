import { fileURLToPath } from "node:url";
import { registerGoldenSuite } from "@ng-openapi/testing";
import { GeneratorConfig } from "ng-openapi";

const baseConfig = (input: string, output: string): GeneratorConfig => ({
    input,
    output,
    options: {
        dateType: "string",
        enumStyle: "union",
        generateServices: true,
    },
});

registerGoldenSuite("ng-openapi golden", {
    goldenDir: fileURLToPath(new URL("./__golden__", import.meta.url)),
    variants: {
        default: baseConfig,
        "date-enum": (input, output) => ({
            ...baseConfig(input, output),
            options: {
                dateType: "Date",
                enumStyle: "enum",
                generateEnumBasedOnDescription: true,
                generateServices: true,
            },
        }),
        "single-request-param": (input, output) => {
            const config = baseConfig(input, output);
            config.options.useSingleRequestParameter = true;
            return config;
        },
        "response-validation": (input, output) => {
            const config = baseConfig(input, output);
            config.options.validation = { response: true };
            return config;
        },
        "client-name": (input, output) => ({
            ...baseConfig(input, output),
            clientName: "PetsApi",
        }),
        "types-only": (input, output) => {
            const config = baseConfig(input, output);
            config.options.generateServices = false;
            return config;
        },
        // Angular 22+ @Service() decorator; no compile-check variant until the
        // repo's own Angular reaches 22 (Service does not exist below that)
        "service-decorator": (input, output) => {
            const config = baseConfig(input, output);
            config.options.serviceDecorator = "service";
            return config;
        },
        // Identifier decoration: prefixed service classes, suffixed models —
        // model declarations and every reference must agree byte-for-byte
        naming: (input, output) => {
            const config = baseConfig(input, output);
            config.options.naming = {
                services: { prefix: "Api" },
                models: { suffix: "Dto" },
            };
            return config;
        },
    },
});
