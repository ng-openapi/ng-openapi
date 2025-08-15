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
        external: [
            "@angular/core",
            "@angular/common",
            "ng-openapi",
            "ts-morph", // Add this - it's being bundled
            "path", // Node.js built-ins
            "fs", // Node.js built-ins
        ],
        splitting: false,
        treeshake: false,
        bundle: true, // Add this explicitly
        minify: false, // Add this for debugging
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
