import { registerCompileCheckSuite } from "@ng-openapi/testing";

registerCompileCheckSuite("ng-openapi compile-check", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "enum",
        generateEnumBasedOnDescription: true,
        generateServices: true,
    },
}));

// naming decorates model identifiers at both their declaration and every
// reference; fixMissingImports silently drops the import when they diverge,
// so only a compile check catches a desync between the two call sites
registerCompileCheckSuite("ng-openapi compile-check (naming)", (input, output) => ({
    input,
    output,
    options: {
        dateType: "Date",
        enumStyle: "enum",
        generateServices: true,
        useSingleRequestParameter: true,
        naming: {
            services: { prefix: "Api" },
            models: { suffix: "Dto" },
        },
    },
}));

// customHeaders emits the default-header guards into every method body —
// the only compile coverage that branch gets, since no golden variant sets it
registerCompileCheckSuite("ng-openapi compile-check (custom headers)", (input, output) => ({
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
}));
