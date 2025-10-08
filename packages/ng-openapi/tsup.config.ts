import { defineConfig } from "tsup";
import { copyFileSync, existsSync, cpSync, mkdirSync } from "fs";
import { join } from "path";

export default defineConfig([
    {
        // STEP 1: Build the core library (index.ts) and copy all static assets.
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        sourcemap: true,
        clean: true, // Clean the output directory ONCE at the very beginning.
        outDir: "../../dist/packages/ng-openapi",
        external: [
            "@angular/core", "@angular/common", "commander", "ts-morph",
            "ts-node", "typescript", "@types/swagger-schema-official", "js-yaml"
        ],
        onSuccess: async () => {
            console.log("Library build successful. Copying static assets...");
            const distDir = "../../dist/packages/ng-openapi";

            // Copy package.json, README, LICENSE, etc.
            if (existsSync("package.json")) copyFileSync("package.json", join(distDir, "package.json"));
            if (existsSync("README.md")) copyFileSync("README.md", join(distDir, "README.md"));
            if (existsSync("../../LICENSE")) copyFileSync("../../LICENSE", join(distDir, "LICENSE"));

            // Copy the admin generator templates.
            const sourceTemplateDir = 'src/lib/generators/admin/templates';
            const destTemplateDir = join(distDir, 'templates');
            if (existsSync(sourceTemplateDir)) {
                if (!existsSync(destTemplateDir)) mkdirSync(destTemplateDir, { recursive: true });
                cpSync(sourceTemplateDir, destTemplateDir, { recursive: true });
                console.log(`✅ Admin templates successfully copied to: ${destTemplateDir}`);
            } else {
                console.error(`❌ CRITICAL: Source templates directory not found at: ${sourceTemplateDir}`);
            }
        },
    },
    {
        // STEP 2: Build ONLY the CLI executable, ensuring the correct filename.
        entry: {
            cli: "src/lib/cli.ts"
        },
        format: ["cjs"],
        clean: false,             // IMPORTANT: DO NOT clean the directory again.
        outDir: "../../dist/packages/ng-openapi",
        external: [
            "@angular/core", "@angular/common", "commander", "ts-morph",
            "ts-node", "typescript", "@types/swagger-schema-official", "js-yaml"
        ],
        platform: 'node',
        // --- THIS IS THE CRITICAL FIX ---
        // This function forces tsup to name the output file `cli.cjs` instead of `cli.js`.
        outExtension() {
            return {
                js: `.cjs`,
            };
        },
    },
]);
