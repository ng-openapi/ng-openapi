import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
    resolve: {
        alias: [
            { find: /^@ng-openapi\/shared$/, replacement: r("packages/shared/src/index.ts") },
            { find: /^@ng-openapi\/shared\/(.*)$/, replacement: r("packages/shared/$1") },
            { find: /^@ng-openapi\/testing$/, replacement: r("packages/testing/src/index.ts") },
            { find: /^ng-openapi$/, replacement: r("packages/ng-openapi/src/index.ts") },
        ],
    },
    test: {
        include: ["packages/**/tests/**/*.test.ts", "packages/**/src/**/*.test.ts"],
        environment: "node",
        testTimeout: 60_000,
        hookTimeout: 60_000,
        reporters: ["default"],
    },
});
