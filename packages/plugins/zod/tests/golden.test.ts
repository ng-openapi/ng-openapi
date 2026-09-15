import { fileURLToPath } from "node:url";
import { registerGoldenSuite } from "@ng-openapi/testing";
import { ZodPlugin } from "../src";

registerGoldenSuite("zod golden", {
    goldenDir: fileURLToPath(new URL("./__golden__", import.meta.url)),
    variants: {
        default: (input, output) => ({
            input,
            output,
            options: {
                dateType: "Date",
                enumStyle: "enum",
                generateServices: true,
                validation: { response: true },
            },
            plugins: [ZodPlugin],
        }),
        // The scaffold reads peer dependencies off the generated imports, so
        // the zod peer must appear without the core knowing this plugin exists
        "npm-package": (input, output) => ({
            input,
            output,
            options: { dateType: "string", enumStyle: "union" },
            plugins: [ZodPlugin],
            package: { name: "@acme/validated-client", angularVersion: "^21.0.0" },
        }),
    },
});
