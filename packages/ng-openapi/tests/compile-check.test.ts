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
