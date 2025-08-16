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
        outDir: "../../../dist/packages/plugins/http-resource",
        external: ["@angular/core", "@angular/common", "ng-openapi", "ts-morph"],
        onSuccess: async () => {
            const distDir = "../../../dist/packages/plugins/http-resource";

            if (existsSync("package.json")) {
                copyFileSync("package.json", join(distDir, "package.json"));
            }

            if (existsSync("README.md")) {
                copyFileSync("README.md", join(distDir, "README.md"));
            }

            if (existsSync("../../../LICENSE")) {
                copyFileSync("../../../LICENSE", join(distDir, "LICENSE"));
            }
        },
    },
]);
