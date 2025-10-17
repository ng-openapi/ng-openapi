import { copyFileSync, existsSync, cpSync, mkdirSync } from "fs";
import { join } from "path";

import { defineConfig } from "tsup";

export default defineConfig([
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        sourcemap: true,
        clean: true,
        outDir: join("..", "..", "dist", "packages", "ng-openapi"),
        external: [
            "@angular/core", "@angular/common", "commander", "ts-morph",
            "ts-node", "typescript", "@types/swagger-schema-official", "js-yaml"
        ],
        onSuccess: async () => {
            console.log("Library build successful. Copying static assets...");
            const distDir = join("..", "..", "dist", "packages", "ng-openapi");

            if (existsSync("package.json")) copyFileSync("package.json", join(distDir, "package.json"));
            if (existsSync("README.md")) copyFileSync("README.md", join(distDir, "README.md"));
            if (existsSync(join("..", "..", "LICENSE")))
                copyFileSync(join("..", "..", "LICENSE"), join(distDir, "LICENSE"));

            const sourceTemplateDir = join('src', 'lib', 'generators', 'admin', 'templates');
            const destTemplateDir = join("..", "..", "dist", "packages", "templates");
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
        entry: {
            cli: "src/lib/cli.ts"
        },
        format: ["cjs"],
        clean: false,
        outDir: "../../dist/packages/ng-openapi",
        external: [
            "@angular/core", "@angular/common", "commander", "ts-morph",
            "ts-node", "typescript", "@types/swagger-schema-official", "js-yaml"
        ],
        platform: 'node',
        outExtension() {
            return {
                js: '.cjs',
            };
        },
    },
]);
