import { defineConfig } from "vitepress";
import packageJson from '../../packages/ng-openapi/package.json';

export default defineConfig({
    title: "ng-openapi",
    description: "Generate Angular services and TypeScript types from OpenAPI/Swagger specifications",

    head: [
        ["link", { rel: "icon", href: "https://raw.githubusercontent.com/ng-openapi/ng-openapi/HEAD/docs/public/favicon.ico" }],
        ["meta", { name: "theme-color", content: "#3c82f6" }],
        ["meta", { property: "og:type", content: "website" }],
        ["meta", { property: "og:locale", content: "en" }],
        ["meta", { property: "og:title", content: "ng-openapi | Angular OpenAPI Client Generator" }],
        ["meta", { property: "og:site_name", content: "ng-openapi" }],
        ["meta", { property: "og:url", content: "https://ng-openapi.github.io/" }],
    ],

    themeConfig: {
        logo: "https://raw.githubusercontent.com/ng-openapi/ng-openapi/HEAD/docs/public/ng-openapi-logo.svg",

        nav: [
            { text: "Home", link: "/" },
            { text: "Getting Started", link: "/getting-started/installation" },
            { text: "Guide", link: "/guide/guides" },
            { text: "API", link: "/api/cli" },
            { text: "⚡ Examples", link: "https://stackblitz.com/@Mr-Jami/collections/ng-openapi-examples" },
            {
                text: `v${packageJson.version}`,
                items: [
                    { text: "Changelog", link: "/migration/changelog" },
                    { text: "NPM", link: "https://www.npmjs.com/package/ng-openapi" },
                ],
            },
        ],

        sidebar: {
            "/getting-started/": [
                {
                    text: "Getting Started",
                    items: [
                        { text: "Installation", link: "/getting-started/installation" },
                        { text: "Quick Start", link: "/getting-started/quick-start" },
                    ],
                },
            ],
            "/guide/": [
                {
                    text: "User Guide",
                    link: "guide/guides",
                    items: [
                        { text: "CLI Usage", link: "/guide/cli-usage" },
                        { text: "Angular Integration", link: "/guide/angular-integration" },
                        { text: "File Download", link: "/guide/file-download" },
                        { text: "Date Handling", link: "/guide/date-handling" },
                        { text: "Code Generation", link: "/guide/generated-code" },
                    ],
                },
            ],
            "/api/": [
                {
                    text: "API Reference",
                    items: [
                        {
                            text: "CLI",
                            link: "/api/cli",
                        },
                        {
                            text: "Configuration",
                            link: "/api/configuration",
                            items: [
                                {
                                    text: "Input",
                                    link: "/api/configuration/input",
                                },
                                {
                                    text: "Output",
                                    link: "/api/configuration/output",
                                },
                                {
                                    text: "Options",
                                    link: "/api/configuration/options",
                                    items: [
                                        {
                                            text: "Date Type",
                                            link: "/api/configuration/options/date-type",
                                        },
                                        {
                                            text: "Enum Style",
                                            link: "/api/configuration/options/enum-style",
                                        },
                                        {
                                            text: "Generate Enums Based on Description",
                                            link: "/api/configuration/options/generate-enums-description",
                                        },
                                        {
                                            text: "Generate Services",
                                            link: "/api/configuration/options/generate-services",
                                        },
                                        {
                                            text: "Customize Method Name",
                                            link: "/api/configuration/options/customize-method-name",
                                        },
                                        {
                                            text: "Custom Headers",
                                            link: "/api/configuration/options/custom-headers",
                                        },
                                        {
                                            text: "Response Type Mapping",
                                            link: "/api/configuration/options/response-type-mapping",
                                        },
                                    ],
                                    collapsed: true,
                                },
                                {
                                    text: "Compiler Options",
                                    link: "/api/configuration/compiler-options",
                                },
                            ],
                            collapsed: true,
                        },
                        { text: "Providers", link: "/api/providers" },
                        {
                            text: "Utilities",
                            link: "/api/utilities",
                            collapsed: true,
                            items: [
                                { text: "Date Transformer", link: "/api/utilities/date-transformer" },
                                { text: "File Download Helper", link: "/api/utilities/file-download-helper" },
                            ],
                        },
                    ],
                },
            ],
        },

        socialLinks: [
            { icon: "github", link: "https://github.com/ng-openapi/ng-openapi" },
            { icon: "npm", link: "https://www.npmjs.com/package/ng-openapi" },
        ],

        search: {
            provider: "local",
        },

        editLink: {
            pattern: "https://github.com/ng-openapi/ng-openapi/edit/main/docs/:path",
            text: "Edit this page on GitHub",
        },

        footer: {
            message: "Released under the MIT License.<br/>This site is powered by <a href=\"https://www.netlify.com\" target=\"_blank\" rel=\"noopener noreferrer\">Netlify</a>",
            copyright: "Copyright © 2025 Tareq Jami",
        },
    },

    markdown: {
        theme: {
            light: "github-light",
            dark: "github-dark",
        },
        lineNumbers: true,
    },
});
