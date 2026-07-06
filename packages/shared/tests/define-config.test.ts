import { describe, expect, it } from "vitest";
import { defineConfig } from "../src";
import type { GeneratorConfig } from "../src";

describe("defineConfig", () => {
    it("returns the exact config object it was given (identity, no cloning)", () => {
        const config: GeneratorConfig = {
            input: "./swagger.json",
            output: "./src/api",
            options: { dateType: "Date", enumStyle: "enum" },
        };

        expect(defineConfig(config)).toBe(config);
    });
});
