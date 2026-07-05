import nx from "@nx/eslint-plugin";
import jsoncParser from "jsonc-eslint-parser";

export default [
    ...nx.configs["flat/base"],
    ...nx.configs["flat/typescript"],
    ...nx.configs["flat/javascript"],
    {
        // docs is VitePress content (plus its build cache), not code we lint;
        // the rest are build/coverage/analysis artifacts.
        ignores: ["**/dist", "docs/**", "coverage/**", "tmp/**", "graphify-out/**"],
    },
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        rules: {
            // Module boundaries by scope tag (REFACTORING_PLAN.md phase 4.2):
            // shared is the foundation and depends on nothing internal; core and
            // plugins may reach shared only; the testing harness may drive
            // everything. A plugin importing from packages/ng-openapi fails here.
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    // shared is intentionally non-buildable: tsup inlines its
                    // sources into each publishable package, so the classic
                    // buildable-lib composition check does not apply here.
                    enforceBuildableLibDependency: false,
                    allow: ["^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"],
                    depConstraints: [
                        {
                            sourceTag: "scope:shared",
                            onlyDependOnLibsWithTags: [],
                        },
                        {
                            sourceTag: "scope:core",
                            onlyDependOnLibsWithTags: ["scope:shared"],
                        },
                        {
                            sourceTag: "scope:plugin",
                            onlyDependOnLibsWithTags: ["scope:shared"],
                        },
                        {
                            sourceTag: "scope:testing",
                            onlyDependOnLibsWithTags: ["scope:core", "scope:plugin", "scope:shared"],
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
                            // `**` is required: a single `*` only matches one path
                            // segment, silently missing nested deep imports like
                            // @ng-openapi/shared/src/utils/functions/is-url.
                            group: [
                                "@ng-openapi/shared/**",
                                "ng-openapi/**",
                                "@ng-openapi/testing/**",
                                "@ng-openapi/http-resource/**",
                                "@ng-openapi/zod/**",
                            ],
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
            // Ratchet complete: phases 1-3 removed the `any`s from package
            // sources; new ones cannot land (REFACTORING_PLAN.md phase 4.3).
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
    {
        // @nx/dependency-checks derives package.json deps from local source
        // imports. That model doesn't fit this workspace: @angular/*, zod and
        // ng-openapi are consumed by the *generated* code inside the user's
        // app (peer model), and @ng-openapi/shared is a bundled internal dir,
        // so its imports (ts-morph, js-yaml, ...) legitimately appear in the
        // publishing packages' manifests without local imports.
        files: ["**/package.json"],
        languageOptions: {
            parser: jsoncParser,
        },
        rules: {
            "@nx/dependency-checks": "off",
        },
    },
    {
        // Test files and the internal testing lib are not part of any production build,
        // so the buildable-lib boundary doesn't apply to them, and they deliberately
        // consume the packages' PUBLIC barrels ("ng-openapi", "@ng-openapi/shared")
        // instead of relative paths — that self-import is allowed here. Patterns use
        // a leading `**/` so they match whether ESLint runs from the workspace root
        // or from a package subdirectory (e.g. `nx lint`).
        files: ["**/tests/**/*.ts", "**/testing/src/**/*.ts"],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: false,
                    allow: [
                        "^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$",
                        "ng-openapi",
                        "@ng-openapi/shared",
                        "@ng-openapi/testing",
                        "@ng-openapi/http-resource",
                        "@ng-openapi/zod",
                    ],
                    depConstraints: [
                        {
                            sourceTag: "*",
                            onlyDependOnLibsWithTags: ["*"],
                        },
                    ],
                },
            ],
            // Casting fixtures into spec shapes is idiomatic in tests
            "@typescript-eslint/no-explicit-any": "warn",
        },
    },
];
