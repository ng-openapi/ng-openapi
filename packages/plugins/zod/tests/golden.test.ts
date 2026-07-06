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
    },
});
