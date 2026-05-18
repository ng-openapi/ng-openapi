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
