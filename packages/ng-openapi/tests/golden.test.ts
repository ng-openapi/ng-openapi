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
        // One model file per schema: kebab-case files, manual cross-model
        // imports, models/index.ts as a barrel; service imports must keep
        // resolving to "../models"
        "per-type-models": (input, output) => {
            const config = baseConfig(input, output);
            config.options.modelFileStructure = "per-type";
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
        // npm package scaffold. angularVersion is pinned so the snapshot does
        // not track the workspace's own Angular; version is left to default
        // from the fixture's info.version. Every fixture — the path-less one
        // included — emits the client runtime here, so the peers are always
        // the derived Angular/rxjs set
        "npm-package": (input, output) => ({
            ...baseConfig(input, output),
            clientName: "PetsApi",
            package: {
                name: "@acme/pets-api-client",
                angularVersion: "^21.0.0",
                repository: "https://github.com/acme/pets-api-client",
                packageJson: { license: "MIT", publishConfig: { access: "public" } },
            },
        }),
        // Types-only package: no runtime is generated, so the only peer left
        // is @angular/common (RequestOptions' HttpContext in models/index.ts)
        // and the README must not document a provider that does not exist
        "npm-package-types-only": (input, output) => {
            const config = baseConfig(input, output);
            config.options.generateServices = false;
            config.package = { name: "@acme/pets-api-models", angularVersion: "^21.0.0" };
            return config;
        },
    },
});
