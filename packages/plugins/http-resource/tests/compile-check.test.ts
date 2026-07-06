import { registerCompileCheckSuite } from "@ng-openapi/testing";
import { HttpResourcePlugin } from "../src";

registerCompileCheckSuite("http-resource plugin compile-check", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "enum",
        generateEnumBasedOnDescription: true,
        generateServices: true,
    },
    plugins: [HttpResourcePlugin],
}));

// naming decorates model identifiers at declaration and reference sites;
// a desync silently drops imports, so only a compile check catches it
registerCompileCheckSuite("http-resource plugin compile-check (naming)", (input, output) => ({
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
}));

// customHeaders is the only path exercising the cast-free HttpHeaders/record
// merge block in the generated resources — it must stay strict-compilable
registerCompileCheckSuite("http-resource plugin compile-check (custom headers)", (input, output) => ({
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
}));
