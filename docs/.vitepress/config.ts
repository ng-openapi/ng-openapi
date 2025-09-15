import { defineConfig } from "vitepress";
import packageJson from "../../packages/ng-openapi/package.json";

export default defineConfig({
    title: "ng-openapi",
    description: "Generate Angular services and TypeScript types from OpenAPI/Swagger specifications",

    head: [
        [
            "link",
            {
                rel: "icon",
                href: "https://raw.githubusercontent.com/ng-openapi/ng-openapi/HEAD/docs/public/favicon.ico",
            },
        ],
        ["meta", { name: "theme-color", content: "#3c82f6" }],
        ["meta", { property: "og:type", content: "website" }],
        ["meta", { property: "og:locale", content: "en" }],
        ["meta", { property: "og:title", content: "ng-openapi | Angular OpenAPI Client Generator" }],
        ["meta", { property: "og:site_name", content: "ng-openapi" }],
        ["meta", { property: "og:url", content: "https://ng-openapi.github.io/" }],
        ["link", { rel: "canonical", href: "https://ng-openapi.dev" }],

        // Schema.org structured data for software
        [
            "script",
            { type: "application/ld+json" },
            JSON.stringify({
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                name: "ng-openapi",
                applicationCategory: "DeveloperApplication",
                operatingSystem: "Cross-platform",
                offers: {
                    "@type": "Offer",
                    price: "0",
                    priceCurrency: "USD",
                },
                description: "Modern Angular-first OpenAPI client generator",
                url: "https://ng-openapi.dev",
                author: {
                    "@type": "Person",
                    name: "Tareq Jami",
                },
                softwareVersion: packageJson.version,
                datePublished: "2024-01-01",
                keywords: "Angular, OpenAPI, TypeScript, Code Generator, Swagger",
            }),
        ],
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
                        { text: "Http Resource", link: "/guide/http-resource" },
                        { text: "Multiple Clients", link: "/guide/multiple-clients" },
                        { text: "Schema Validation", link: "/guide/schema-validation" },
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
                                    text: "Client Name",
                                    link: "/api/configuration/client-name",
                                },
                                {
                                    text: "Input",
                                    link: "/api/configuration/input",
                                },
                                {
                                    text: "Output",
                                    link: "/api/configuration/output",
                                },
                                {
                                    text: "Validate Input",
                                    link: "/api/configuration/validate-input",
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
                                            text: "Validation",
                                            link: "/api/configuration/options/validation",
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
                                {
                                    text: "Plugins",
                                    link: "/api/configuration/plugins",
                                    items: [
                                        {
                                            text: "Http Resource",
                                            link: "/api/configuration/plugins/http-resource",
                                        },
                                        {
                                            text: "Zod",
                                            link: "/api/configuration/plugins/zod",
                                        },
                                    ],
                                    collapsed: true,
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
            message:
                'Released under the MIT License.<br/>This site is powered by <a href="https://www.netlify.com" target="_blank" rel="noopener noreferrer">Netlify</a>',
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

    cleanUrls: true,
    sitemap: {
        hostname: "https://ng-openapi.dev",
        transformItems: (items) => {
            return items.map((item) => {
                console.log(item.url);
                const url = item.url;
                // Homepage
                if (url === "") {
                    return { ...item, priority: 1.0, changefreq: "weekly" };
                }
                // Getting started
                else if (url.includes("getting-started/")) {
                    return { ...item, priority: 0.9, changefreq: "weekly" };
                }
                // Guides
                else if (url.includes("guide/")) {
                    return { ...item, priority: 0.8, changefreq: "weekly" };
                }
                // API docs
                else if (url.includes("api/")) {
                    return { ...item, priority: 0.7, changefreq: "monthly" };
                }
                // Default
                return { ...item, priority: 0.6, changefreq: "monthly" };
            });
        },
    },
});
