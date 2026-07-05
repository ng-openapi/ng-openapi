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
    },
});
