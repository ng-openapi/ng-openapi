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
