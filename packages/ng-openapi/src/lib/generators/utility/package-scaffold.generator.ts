import { Project } from "ts-morph";
import * as path from "path";
import {
    clientNameIdentifier,
    ConfigValidationError,
    effectiveClientName,
    emitJsonFile,
    emitTextFile,
    isPlainObject,
    isSemver,
    listImportedPackageNames,
    PackageConfig,
    PackageGenOptions,
    SpecInfo,
} from "@ng-openapi/shared";
import {
    DEFAULT_ANGULAR_MAJOR,
    DEV_DEPENDENCY_RANGES,
    KNOWN_PEER_RANGES,
    leadingMajor,
    MIN_ANGULAR_MAJOR,
    PACKAGE_JSON_MARKER,
    TSLIB_RANGE,
} from "./package-scaffold.versions";

/**
 * Library tsconfig for the ng-packagr build, verified by the smoke test.
 * Passed with `-c`, this file *replaces* ng-packagr's built-in tsconfig, so
 * every option here is load-bearing: drop `module`/`moduleResolution` and
 * TypeScript's own defaults apply, not ng-packagr's. (ng-packagr still forces
 * `target`, `declaration`, `sourceMap`, `inlineSources` and the flat-module
 * settings on top.) `strict` is for anything a user adds next to the
 * generated sources; those ship `@ts-nocheck` themselves.
 */
const LIBRARY_TSCONFIG = {
    compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "bundler",
        lib: ["ES2022", "dom"],
        declaration: true,
        sourceMap: true,
        inlineSources: true,
        strict: true,
        skipLibCheck: true,
        isolatedModules: true,
        importHelpers: true,
    },
    angularCompilerOptions: {
        // Partial compilation is what a library published to npm must ship:
        // the consuming application's Angular compiler finishes the job, so
        // the package is not tied to the exact Angular patch it was built with
        compilationMode: "partial",
        strictInjectionParameters: true,
    },
};

/**
 * Emits the files that make the output directory a standalone Angular
 * library: package.json, ng-package.json, tsconfig.json, README.md and
 * .gitignore. Runs last, after every other generator and plugin, because
 * package.json's peerDependencies are read off the generated code itself
 * (listImportedPackageNames) — the Project is the manifest, so a plugin's
 * imports are covered without this generator knowing the plugin exists.
 *
 * The root index.ts the main-index generator writes is already the public
 * API, so ng-package.json points ng-packagr at it directly.
 */
export class PackageScaffoldGenerator {
    private readonly project: Project;
    private readonly config: PackageGenOptions;
    private readonly specInfo: SpecInfo | undefined;
    private readonly detectedAngularVersion: string | undefined;
    private readonly onWarning: (message: string) => void;

    /**
     * @param detectedAngularVersion the workspace's installed @angular/core
     *   version, detected once by the orchestrator. Passed in rather than
     *   detected here so the output is a function of its inputs — tests pin it.
     */
    constructor(
        project: Project,
        config: PackageGenOptions,
        specInfo: SpecInfo | undefined,
        detectedAngularVersion: string | undefined,
        onWarning: (message: string) => void,
    ) {
        this.project = project;
        this.config = config;
        this.specInfo = specInfo;
        this.detectedAngularVersion = detectedAngularVersion;
        this.onWarning = onWarning;
    }

    generate(outputRoot: string): void {
        const pkg = this.config.package;
        const { peerRange: angularPeerRange, major: angularMajor } = this.resolveAngularVersion(pkg);
        const version = this.resolveVersion(pkg);
        const imported = listImportedPackageNames(this.project);

        const description = collapseWhitespace(this.specInfo?.description);
        const generated: Record<string, unknown> = {
            name: pkg.name,
            version,
            ...(description ? { description } : {}),
            ...(pkg.repository !== undefined ? { repository: pkg.repository } : {}),
            ...(pkg.publishRegistry !== undefined ? { publishConfig: { registry: pkg.publishRegistry } } : {}),
            sideEffects: false,
            scripts: {
                // -c is not optional: without it ng-packagr compiles with its
                // own built-in tsconfig and the emitted one is never read
                build: "ng-packagr -p ng-package.json -c tsconfig.json",
            },
            peerDependencies: this.buildPeerDependencies(imported, angularPeerRange, pkg.packageJson),
            dependencies: { tslib: TSLIB_RANGE },
            devDependencies: this.buildDevDependencies(imported, angularMajor),
            ...PACKAGE_JSON_MARKER,
        };
        const packageJson = mergePackageJson(generated, pkg.packageJson);
        this.warnOnReplacedBuildKeys(generated, packageJson);

        emitJsonFile(this.project, path.join(outputRoot, "package.json"), packageJson);
        emitJsonFile(this.project, path.join(outputRoot, "ng-package.json"), {
            $schema: "./node_modules/ng-packagr/ng-package.schema.json",
            dest: "dist",
            lib: { entryFile: "index.ts" },
        });
        emitJsonFile(this.project, path.join(outputRoot, "tsconfig.json"), LIBRARY_TSCONFIG);
        // README documents the provider only if providers.ts was actually
        // generated — the Project is the manifest
        const hasProviders = this.project.getSourceFile(path.join(outputRoot, "providers.ts")) !== undefined;
        emitTextFile(this.project, path.join(outputRoot, "README.md"), this.buildReadme(pkg, hasProviders));
        emitTextFile(this.project, path.join(outputRoot, ".gitignore"), "node_modules/\ndist/\n");
    }

    /**
     * A `packageJson` override may replace the build script, but the README's
     * build and publish steps assume it. Honored, since the user asked — but
     * said. (tslib needs no such guard: validation keeps it a string, and
     * ng-packagr adds it to the published manifest regardless.)
     */
    private warnOnReplacedBuildKeys(generated: Record<string, unknown>, merged: Record<string, unknown>): void {
        const before = (generated["scripts"] as Record<string, unknown>)["build"];
        const after = (merged["scripts"] as Record<string, unknown>)["build"];
        if (after !== before) {
            this.onWarning(
                `package: packageJson.scripts.build replaces the generated ${JSON.stringify(before)} with ` +
                    `${JSON.stringify(after)} — \`npm run build\` will no longer run ng-packagr as the README says.`,
            );
        }
    }

    /**
     * Explicit config wins; otherwise the workspace's installed Angular;
     * otherwise the generator's own supported major — a guess, so it is
     * reported: a package that claims the wrong Angular peer range installs
     * and then fails at build time in the consumer, which is worse than a
     * warning at generation time.
     */
    private resolveAngularVersion(pkg: PackageConfig): { peerRange: string; major: number } {
        if (pkg.angularVersion !== undefined) {
            const major = leadingMajor(pkg.angularVersion);
            if (major === undefined) {
                // Validation rejects this shape; a caller that skipped it must
                // not get a peer range silently paired with the default toolchain
                throw new ConfigValidationError([
                    `\`package.angularVersion\` has no leading Angular major, got ${JSON.stringify(pkg.angularVersion)}`,
                ]);
            }
            return { peerRange: pkg.angularVersion, major };
        }
        const detectedMajor = this.detectedAngularVersion ? leadingMajor(this.detectedAngularVersion) : undefined;
        if (detectedMajor !== undefined && detectedMajor >= MIN_ANGULAR_MAJOR) {
            return { peerRange: `^${detectedMajor}.0.0`, major: detectedMajor };
        }
        // The core supports Angular 15, but the emitted toolchain config does
        // not (see MIN_ANGULAR_MAJOR); a source-linked "0.0.0-PLACEHOLDER"
        // lands here too. Same soft-guard philosophy as the @Service() check:
        // the workspace running the generator is not necessarily the one
        // that builds the package, so guess, but say so.
        const reason =
            detectedMajor === undefined
                ? "no @angular/core found in this workspace to derive the Angular version from"
                : `the @angular/core ${this.detectedAngularVersion} found in this workspace is older than ` +
                  `Angular ${MIN_ANGULAR_MAJOR}, the oldest the generated build config supports`;
        this.onWarning(
            `package: ${reason} — assuming Angular ${DEFAULT_ANGULAR_MAJOR} for package.json. ` +
                `Set \`package.angularVersion\` (e.g. "^${DEFAULT_ANGULAR_MAJOR}.0.0") to pin it.`,
        );
        return { peerRange: `^${DEFAULT_ANGULAR_MAJOR}.0.0`, major: DEFAULT_ANGULAR_MAJOR };
    }

    /**
     * The spec's info.version is the natural default but is free text —
     * "1.0" and "v2" are common and npm refuses both at publish time, which
     * is the moment the user is least able to act on it.
     */
    private resolveVersion(pkg: PackageConfig): string {
        if (pkg.version !== undefined) {
            return pkg.version;
        }
        const specVersion = this.specInfo?.version?.trim();
        if (!specVersion) {
            this.onWarning(
                `package: the spec has no info.version, so package.json gets version "0.0.0". ` +
                    `Set \`package.version\` (or info.version in the spec).`,
            );
            return "0.0.0";
        }
        if (!isSemver(specVersion)) {
            this.onWarning(
                `package: version ${JSON.stringify(specVersion)} taken from the spec's info.version is not a valid ` +
                    `semver version; npm will refuse to publish it. Set \`package.version\` to override.`,
            );
        }
        return specVersion;
    }

    private buildPeerDependencies(
        imported: string[],
        angularPeerRange: string,
        overrides: PackageConfig["packageJson"],
    ): Record<string, string> {
        // Ranges the user already supplied — the "*" warning tells them to,
        // so it must fall silent once they have
        const overridden = isPlainObject(overrides?.["peerDependencies"]) ? overrides["peerDependencies"] : {};
        const peerDependencies: Record<string, string> = {};
        for (const name of imported) {
            if (name.startsWith("@angular/")) {
                peerDependencies[name] = angularPeerRange;
            } else if (name in KNOWN_PEER_RANGES) {
                peerDependencies[name] = KNOWN_PEER_RANGES[name];
            } else {
                peerDependencies[name] = "*";
                if (typeof overridden[name] === "string") {
                    continue;
                }
                this.onWarning(
                    `package: generated code imports "${name}", which ng-openapi has no known version range for — ` +
                        `pinning it to "*" in package.json. Set \`package.packageJson.peerDependencies["${name}"]\` to a real range.`,
                );
            }
        }
        return peerDependencies;
    }

    /**
     * The ng-packagr toolchain plus every peer, so `npm install && npm run
     * build` works in the output directory alone. All Angular-family
     * packages share one major: they must resolve to identical versions or
     * npm refuses the install.
     */
    private buildDevDependencies(imported: string[], angularMajor: number): Record<string, string> {
        const angularRange = `^${angularMajor}.0.0`;
        const devDependencies: Record<string, string> = {
            "@angular/common": angularRange,
            "@angular/compiler": angularRange,
            "@angular/compiler-cli": angularRange,
            "@angular/core": angularRange,
            "ng-packagr": angularRange,
        };
        for (const name of imported) {
            if (name in DEV_DEPENDENCY_RANGES) {
                devDependencies[name] = DEV_DEPENDENCY_RANGES[name];
            }
        }
        // typescript is deliberately absent: its compatible range differs per
        // Angular major, and npm installs it from @angular/compiler-cli's peer
        // range — the one place that range is maintained correctly.
        return devDependencies;
    }

    /**
     * The provider function name is built with the same helpers the provider
     * generator uses, so the documented call cannot drift from the emitted one.
     * Spec text reaches Markdown prose only — the worst a stray `*` can do
     * there is italics.
     */
    private buildReadme(pkg: PackageConfig, hasProviders: boolean): string {
        const title = this.specInfo?.title?.replace(/\s+/g, " ").trim();
        const intro = title
            ? `Angular client for ${title}, generated by [ng-openapi](https://ng-openapi.dev).`
            : `Angular client generated by [ng-openapi](https://ng-openapi.dev).`;

        return `# ${pkg.name}

${intro}

Every generated file in this directory, including this one, is rewritten on
each \`ng-openapi\` run. Configure packaging through the \`package\` option of
your ng-openapi config rather than editing the generated files.

## Build

\`\`\`bash
npm install
npm run build
\`\`\`

ng-packagr compiles the library in the Angular Package Format into \`dist/\`.

## Publish

\`\`\`bash
cd dist
npm publish
\`\`\`

## Use

\`\`\`bash
npm install ${pkg.name}
\`\`\`

${hasProviders ? this.buildProviderUsage(pkg) : this.buildModelsOnlyUsage(pkg)}`;
    }

    private buildProviderUsage(pkg: PackageConfig): string {
        const providerFunction = `provide${clientNameIdentifier(effectiveClientName(this.config.clientName))}Client`;
        return `\`\`\`typescript
// app.config.ts
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { ${providerFunction} } from "${pkg.name}";

export const appConfig: ApplicationConfig = {
    providers: [provideHttpClient(), ${providerFunction}({ basePath: "https://api.example.com" })],
};
\`\`\`

Services are root-provided: \`inject(SomeService)\` anywhere in the application.
`;
    }

    private buildModelsOnlyUsage(pkg: PackageConfig): string {
        return `This package contains the API's model types only — no services or providers.

\`\`\`typescript
import type { SomeModel } from "${pkg.name}";
\`\`\`
`;
    }
}

/**
 * User overrides on top of the generated package.json: nested objects merge
 * key by key, anything else is replaced. Merging (not replacing) the
 * dependency maps is what keeps a derived peer dependency from being dropped
 * — a user can change `peerDependencies.rxjs`'s range but not remove rxjs
 * while the generated code still imports it. An explicit `undefined` is
 * skipped for the same reason: JSON.stringify would silently omit the key.
 */
function mergePackageJson(
    generated: Record<string, unknown>,
    overrides: Record<string, unknown> | undefined,
): Record<string, unknown> {
    if (!overrides) {
        return generated;
    }
    const merged: Record<string, unknown> = { ...generated };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) {
            continue;
        }
        const existing = merged[key];
        merged[key] = isPlainObject(existing) && isPlainObject(value) ? mergePackageJson(existing, value) : value;
    }
    return merged;
}

/** One line of prose from possibly multi-line spec text; undefined when there is nothing left. */
function collapseWhitespace(text: string | undefined): string | undefined {
    const collapsed = text?.replace(/\s+/g, " ").trim();
    return collapsed ? collapsed : undefined;
}
