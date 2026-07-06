import { fileURLToPath } from "node:url";
import { registerGoldenSuite } from "@ng-openapi/testing";
import { HttpResourcePlugin } from "../src";

registerGoldenSuite("http-resource golden", {
    goldenDir: fileURLToPath(new URL("./__golden__", import.meta.url)),
    variants: {
        default: (input, output) => ({
            input,
            output,
            options: {
                dateType: "Date",
                enumStyle: "enum",
                generateServices: true,
            },
            plugins: [HttpResourcePlugin],
        }),
        // Snapshots the cast-free HttpHeaders/record merge block and the
        // headers-after-spread ordering in the generated resources
        "custom-headers": (input, output) => ({
            input,
            output,
            options: {
                dateType: "Date",
                enumStyle: "enum",
                generateServices: true,
                customHeaders: {
                    "X-Api-Key": "demo-key",
                    "X-Client-Version": "1.2.3",
                },
            },
            plugins: [HttpResourcePlugin],
        }),
        // Angular 22+ @Service() decorator on both the core services and the
        // generated resources
        "service-decorator": (input, output) => ({
            input,
            output,
            options: {
                dateType: "Date",
                enumStyle: "enum",
                generateServices: true,
                serviceDecorator: "service",
            },
            plugins: [HttpResourcePlugin],
        }),
        // Per-type model files: resource imports must keep resolving to the
        // "../models" barrel, not the individual model files
        "per-type-models": (input, output) => ({
            input,
            output,
            options: {
                dateType: "Date",
                enumStyle: "enum",
                generateServices: true,
                modelFileStructure: "per-type",
            },
            plugins: [HttpResourcePlugin],
        }),
        // Identifier decoration across core services, resources and models —
        // the resources barrel must re-derive the same decorated class names
        naming: (input, output) => ({
            input,
            output,
            options: {
                dateType: "Date",
                enumStyle: "enum",
                generateServices: true,
                naming: {
                    services: { prefix: "Api" },
                    resources: { suffix: "ApiResource" },
                    models: { suffix: "Dto" },
                },
            },
            plugins: [HttpResourcePlugin],
        }),
    },
});
