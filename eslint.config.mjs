import nx from "@nx/eslint-plugin";

export default [
    ...nx.configs["flat/base"],
    ...nx.configs["flat/typescript"],
    ...nx.configs["flat/javascript"],
    {
        ignores: ["**/dist"],
    },
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: true,
                    allow: ["^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"],
                    depConstraints: [
                        {
                            sourceTag: "*",
                            onlyDependOnLibsWithTags: ["*"],
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.js", "**/*.jsx", "**/*.cjs", "**/*.mjs"],
        // Override or add rules here
        rules: {
            // Package internals must be reached through the public barrel; deep
            // imports bypass the curated API (REFACTORING_PLAN.md phase 1.2/1.3).
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@ng-openapi/shared/*", "ng-openapi/*", "@ng-openapi/testing/*"],
                            message: "Import from the package's public barrel instead of internal paths.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            // Ratchet: warn now, error once phases 1-3 remove the remaining `any`s
            // (REFACTORING_PLAN.md phase 4.3).
            "@typescript-eslint/no-explicit-any": "warn",
        },
    },
    {
        // Test files and the internal testing lib are not part of any production build,
        // so the buildable-lib boundary doesn't apply to them. Patterns use a leading
        // `**/` so they match whether ESLint runs from the workspace root or from a
        // package subdirectory (e.g. `nx lint`).
        files: ["**/tests/**/*.ts", "**/testing/src/**/*.ts"],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: false,
                    allow: ["^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"],
                    depConstraints: [
                        {
                            sourceTag: "*",
                            onlyDependOnLibsWithTags: ["*"],
                        },
                    ],
                },
            ],
        },
    },
];
