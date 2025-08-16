import { defineConfig } from "tsup";
import { copyFileSync, existsSync } from "fs";
import { join } from "path";

export default defineConfig([
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        sourcemap: true,
        clean: true,
        outDir: "../../dist/packages/ng-openapi",
        external: [
            "@angular/core",
            "@angular/common",
            "commander",
            "ts-morph",
            "ts-node",
            "typescript",
            "@types/swagger-schema-official",
            "js-yaml",
            "path",
            "fs",
        ],
        onSuccess: async () => {
            const distDir = "../../dist/packages/ng-openapi";

            // Copy package.json
            if (existsSync("package.json")) {
                copyFileSync("package.json", join(distDir, "package.json"));
            }

            // Copy README.md
            if (existsSync("README.md")) {
                copyFileSync("README.md", join(distDir, "README.md"));
            }

            // Copy LICENSE from root
            if (existsSync("../../LICENSE")) {
                copyFileSync("../../LICENSE", join(distDir, "LICENSE"));
            }
        },
    },
    {
        entry: { cli: "src/lib/cli.ts" },
        format: ["cjs"],
        dts: false,
        sourcemap: true,
        clean: true,
        outDir: "../../dist/packages/ng-openapi",
        outExtension() {
            return {
                js: ".cjs",
            };
        },
        external: [
            "@angular/core",
            "@angular/common",
            "commander",
            "ts-morph",
            "ts-node",
            "typescript",
            "@types/swagger-schema-official",
            "js-yaml",
        ],
        platform: "node",
        target: "node18",
    },
]);
