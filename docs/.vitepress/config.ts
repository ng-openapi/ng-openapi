import { defineConfig } from "vitepress";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import packageJson from "../../packages/ng-openapi/package.json";

const SITE_URL = "https://ng-openapi.dev";

/** Canonical page URL for a markdown source path (mirrors cleanUrls: true). */
function pageUrl(relativePath: string): string {
    const clean = relativePath
        .replace(/\\/g, "/")
        .replace(/index\.md$/, "")
        .replace(/\.md$/, "");
    return `${SITE_URL}/${clean}`;
}

// ---------------------------------------------------------------------------
// LLM-friendly outputs (see https://llmstxt.org/): buildEnd writes
//  - /llms-full.txt   — the whole documentation concatenated in reading order
//  - /<page>.md       — the processed markdown source next to each HTML page
// ---------------------------------------------------------------------------

/** Pages that should not be fed to LLMs or served as raw markdown. */
const LLM_EXCLUDED = new Set(["imprint.md"]);

/** Section reading order for llms-full.txt; alphabetical within a section. */
const LLM_SECTION_ORDER = ["index.md", "getting-started/", "guide/", "api/", "changelog/"];

function sectionRank(relativePath: string): number {
    const rank = LLM_SECTION_ORDER.findIndex(
        (prefix) => relativePath === prefix || relativePath.startsWith(prefix),
    );
    return rank === -1 ? LLM_SECTION_ORDER.length : rank;
}

function walkMarkdown(dir: string, base = dir): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "public" || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkMarkdown(full, base));
        } else if (entry.name.endsWith(".md")) {
            out.push(path.relative(base, full).replace(/\\/g, "/"));
        }
    }
    return out;
}

/** Inline VitePress `<!--@include: file{start,end}-->` directives (used by the changelog pages). */
function resolveIncludes(content: string, fileDir: string): string {
    return content.replace(/<!--\s*@include:\s*(.+?)\s*-->/g, (match, target: string) => {
        const rangeMatch = target.match(/^(.*?)\{(\d*),(\d*)\}$/);
        const includePath = path.resolve(fileDir, (rangeMatch ? rangeMatch[1] : target).trim());
        if (!fs.existsSync(includePath)) return match;
        let lines = fs.readFileSync(includePath, "utf-8").split("\n");
        if (rangeMatch) {
            const start = rangeMatch[2] ? parseInt(rangeMatch[2], 10) - 1 : 0;
            const end = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : lines.length;
            lines = lines.slice(start, end);
        }
        return lines.join("\n");
    });
}

function stripFrontmatter(content: string): string {
    return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

export default defineConfig({
    title: "ng-openapi",
    description: "Generate Angular services and TypeScript types from OpenAPI/Swagger specifications",

    head: [
        ["link", { rel: "icon", href: "/favicon.ico" }],
        ["meta", { name: "theme-color", content: "#3c82f6" }],
        ["meta", { property: "og:type", content: "website" }],
        ["meta", { property: "og:locale", content: "en" }],
        ["meta", { property: "og:site_name", content: "ng-openapi" }],
        ["meta", { property: "og:image", content: `${SITE_URL}/og-image.png` }],
        ["meta", { property: "og:image:width", content: "1200" }],
        ["meta", { property: "og:image:height", content: "630" }],
        ["meta", { name: "twitter:card", content: "summary_large_image" }],
        ["meta", { name: "twitter:image", content: `${SITE_URL}/og-image.png` }],

        // Context7 AI chat widget (floating chat button on every page)
        [
            "script",
            {
                src: "https://context7.com/widget.js",
                "data-library": "/ng-openapi/ng-openapi",
                "data-color": "#3c82f6",
                async: "",
            },
        ],

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
                dateModified: new Date().toISOString(),
                inLanguage: "en-US",
                keywords: "Angular, OpenAPI, TypeScript, Code Generator, Swagger",
            }),
        ],
    ],

    lastUpdated: true,

    // Per-page canonical URL and Open Graph tags. A single site-wide canonical
    // would tell crawlers every page is a duplicate of the homepage.
    transformPageData(pageData) {
        const url = pageUrl(pageData.relativePath);
        const isHome = pageData.frontmatter.layout === "home";
        const title = isHome
            ? "ng-openapi | Angular OpenAPI Client Generator"
            : `${pageData.title} | ng-openapi`;
        const description =
            pageData.description ||
            "Generate Angular services and TypeScript types from OpenAPI/Swagger specifications";

        pageData.frontmatter.head ??= [];
        pageData.frontmatter.head.push(
            ["link", { rel: "canonical", href: url }],
            ["meta", { property: "og:url", content: url }],
            ["meta", { property: "og:title", content: title }],
            ["meta", { property: "og:description", content: description }],
        );
    },

    themeConfig: {
        logo: "/ng-openapi-logo.svg",

        notFound: {
            title: "Page not found",
            quote: "The page may have moved during a docs restructure. Try the search, or start from the Quick Start.",
            linkText: "Go to Quick Start",
            link: "/getting-started/quick-start",
        },

        nav: [
            { text: "Home", link: "/" },
            { text: "Getting Started", link: "/getting-started/installation" },
            { text: "Guide", link: "/guide/guides" },
            { text: "API", link: "/api/cli" },
            { text: "⚡ Examples", link: "https://stackblitz.com/@Mr-Jami/collections/ng-openapi-examples" },
            { text: "💖 Sponsor", link: "https://github.com/sponsors/ng-openapi" },
            {
                text: `v${packageJson.version}`,
                items: [
                    { text: "Changelog", link: "/changelog/" },
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
                    text: "Setup",
                    items: [
                        { text: "Overview", link: "/guide/guides" },
                        { text: "CLI Usage", link: "/guide/cli-usage" },
                        { text: "Angular Integration", link: "/guide/angular-integration" },
                        { text: "Generated Output", link: "/guide/generated-code" },
                    ],
                },
                {
                    text: "Features",
                    items: [
                        { text: "Multiple Clients", link: "/guide/multiple-clients" },
                        { text: "Date Handling", link: "/guide/date-handling" },
                        { text: "File Downloads", link: "/guide/file-download" },
                        { text: "Schema Validation", link: "/guide/schema-validation" },
                    ],
                },
                {
                    text: "Plugins",
                    items: [
                        { text: "HTTP Resource", link: "/guide/http-resource" },
                        { text: "Plugin Authoring", link: "/guide/plugin-authoring" },
                    ],
                },
            ],
            "/changelog/": [
                {
                    text: "Changelog",
                    items: [
                        { text: "Overview", link: "/changelog/" },
                        { text: "ng-openapi", link: "/changelog/ng-openapi" },
                        { text: "@ng-openapi/http-resource", link: "/changelog/http-resource" },
                        { text: "@ng-openapi/zod", link: "/changelog/zod" },
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
                                            text: "Emit Accept Header",
                                            link: "/api/configuration/options/emit-accept-header",
                                        },
                                        {
                                            text: "Response Type Mapping",
                                            link: "/api/configuration/options/response-type-mapping",
                                        },
                                        {
                                            text: "Use Single Request Parameter",
                                            link: "/api/configuration/options/use-single-request-parameter",
                                        },
                                        {
                                            text: "Service Decorator",
                                            link: "/api/configuration/options/service-decorator",
                                        },
                                        {
                                            text: "Naming",
                                            link: "/api/configuration/options/naming",
                                        },
                                        {
                                            text: "Model File Structure",
                                            link: "/api/configuration/options/model-file-structure",
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
                            collapsed: false,
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
                'Released under the MIT License.<br/>This site is powered by <a href="https://www.netlify.com" target="_blank" rel="noopener noreferrer">Netlify</a><br/><a href="/imprint">Impressum</a>',
            copyright: "Copyright © 2026 Tareq Jami",
        },

        lastUpdated: {
            text: "Updated at",
            formatOptions: {
                dateStyle: "full",
                timeStyle: "medium",
            },
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

    buildEnd(siteConfig) {
        const srcDir = siteConfig.srcDir;
        const outDir = siteConfig.outDir;

        // Serve the root context7.json (single source of truth) at /context7.json
        // without committing a duplicate under docs/public. The served copy points
        // `url` at the hosted llms-full.txt index; the repo file stays untouched.
        const context7Src = path.resolve(srcDir, "..", "context7.json");
        if (fs.existsSync(context7Src)) {
            const context7 = JSON.parse(fs.readFileSync(context7Src, "utf-8"));
            context7.url = "https://context7.com/llmstxt/ng-openapi_dev_llms-full_txt";
            fs.writeFileSync(
                path.join(outDir, "context7.json"),
                JSON.stringify(context7, null, 4) + "\n",
            );
        }

        const files = walkMarkdown(srcDir)
            .filter((file) => !LLM_EXCLUDED.has(file))
            .sort((a, b) => sectionRank(a) - sectionRank(b) || a.localeCompare(b));

        const sections: string[] = [
            "# ng-openapi — full documentation",
            "",
            "> Concatenated documentation of ng-openapi (https://ng-openapi.dev)," +
                " generated from the same sources as the website." +
                " See https://ng-openapi.dev/llms.txt for the index and usage rules.",
        ];

        for (const file of files) {
            const fullPath = path.join(srcDir, file);
            const processed = resolveIncludes(fs.readFileSync(fullPath, "utf-8"), path.dirname(fullPath));

            // Raw markdown next to the HTML page (e.g. /guide/cli-usage.md)
            const target = path.join(outDir, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, processed);

            sections.push("", "---", "", `<!-- Source: ${pageUrl(file)} -->`, "", stripFrontmatter(processed).trim());
        }

        fs.writeFileSync(path.join(outDir, "llms-full.txt"), sections.join("\n") + "\n");
    },

    sitemap: {
        hostname: "https://ng-openapi.dev",
        transformItems: (items) => {
            return items.map((item) => {
                const url = item.url;

                // Get last git commit date for the file
                const filePath = path.join("docs", url ? `${url}.md` : "index.md");
                let lastmod;

                try {
                    const gitDate = execSync(`git log -1 --format=%cI "${filePath}"`, { encoding: "utf-8" }).trim();
                    lastmod = gitDate || new Date().toISOString();
                } catch {
                    lastmod = new Date().toISOString();
                }

                // Homepage
                if (url === "") {
                    return { ...item, priority: 1.0, changefreq: "weekly", lastmod };
                }
                // Getting started
                else if (url.includes("getting-started/")) {
                    return { ...item, priority: 0.9, changefreq: "weekly", lastmod };
                }
                // Guides
                else if (url.includes("guide/")) {
                    return { ...item, priority: 0.8, changefreq: "weekly", lastmod };
                }
                // API docs
                else if (url.includes("api/")) {
                    return { ...item, priority: 0.7, changefreq: "monthly", lastmod };
                }
                // Default
                return { ...item, priority: 0.6, changefreq: "monthly", lastmod };
            });
        },
    },
});
