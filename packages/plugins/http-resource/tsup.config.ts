import { defineConfig } from "tsup";
import { copyFileSync, existsSync } from "fs";
import { join } from "path";

export default defineConfig([
    // Main library build
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        sourcemap: true,
        clean: true,
        outDir: "../../../dist/packages/plugins/http-resource",
        external: ["@angular/core", "@angular/common", "ng-openapi"],
        onSuccess: async () => {
            const distDir = "../../../dist/packages/plugins/http-resource";

            // Copy package.json
            if (existsSync("package.json")) {
                copyFileSync("package.json", join(distDir, "package.json"));
            }

            // Copy README.md
            if (existsSync("README.md")) {
                copyFileSync("README.md", join(distDir, "README.md"));
            }

            // Copy LICENSE from root
            if (existsSync("../../../LICENSE")) {
                copyFileSync("../../../LICENSE", join(distDir, "LICENSE"));
            }
        },
    },
]);