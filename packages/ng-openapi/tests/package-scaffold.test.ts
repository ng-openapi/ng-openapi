import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { ConfigValidationError, PackageConfig, SpecInfo } from "@ng-openapi/shared";
import { detectAngularCoreVersion } from "../src/lib/core/angular-version";
import { PackageScaffoldGenerator } from "../src/lib/generators/utility/package-scaffold.generator";
import { DEFAULT_ANGULAR_MAJOR, leadingMajor } from "../src/lib/generators/utility/package-scaffold.versions";

const OUT = "/out";

/** The package.json fields these tests look at. */
interface PackageJsonShape {
    name: string;
    version: string;
    description?: string;
    repository?: unknown;
    publishConfig?: Record<string, string>;
    sideEffects: boolean;
    license?: string;
    files?: string[];
    scripts: Record<string, string>;
    peerDependencies: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    ngOpenapi?: { generated: boolean };
}

interface TsconfigShape {
    angularCompilerOptions: { compilationMode: string };
}

interface RunOptions {
    package: PackageConfig;
    clientName?: string;
    specInfo?: SpecInfo;
    detectedAngularVersion?: string;
    /** Bare imports to plant in a generated-looking service file. */
    imports?: string[];
    /** Whether the run generated providers.ts (the client runtime). Default: true. */
    providers?: boolean;
}

/** Runs the generator against an in-memory project and returns what it emitted. */
function run(options: RunOptions) {
    const project = new Project({ useInMemoryFileSystem: true });
    const imports = options.imports ?? ["@angular/core", "@angular/common/http", "rxjs"];
    project.createSourceFile(
        `${OUT}/services/a.service.ts`,
        imports.map((specifier, i) => `import * as m${i} from "${specifier}";`).join("\n"),
    );
    project.createSourceFile(`${OUT}/index.ts`, 'export * from "./services/a.service";');
    if (options.providers !== false) {
        project.createSourceFile(`${OUT}/providers.ts`, "export function provideDefaultClient() {}");
    }

    const warnings: string[] = [];
    new PackageScaffoldGenerator(
        project,
        { clientName: options.clientName, package: options.package },
        // A spec with a version, unless the test says otherwise: a missing one warns
        "specInfo" in options ? options.specInfo : { version: "1.0.0" },
        options.detectedAngularVersion,
        (message) => warnings.push(message),
    ).generate(OUT);

    const text = (file: string) => project.getSourceFileOrThrow(`${OUT}/${file}`).getFullText();
    const json = <T>(file: string) => JSON.parse(text(file)) as T;
    return { project, warnings, text, json, packageJson: json<PackageJsonShape>("package.json") };
}

describe("PackageScaffoldGenerator", () => {
    it("emits the five scaffold files at the output root", () => {
        const { project } = run({ package: { name: "x", angularVersion: "^21.0.0" } });
        const emitted = project
            .getSourceFiles()
            .map((f) => f.getFilePath())
            .sort();
        expect(emitted).toEqual([
            "/out/.gitignore",
            "/out/README.md",
            "/out/index.ts",
            "/out/ng-package.json",
            "/out/package.json",
            "/out/providers.ts",
            "/out/services/a.service.ts",
            "/out/tsconfig.json",
        ]);
    });

    it("points ng-packagr at the generated root index.ts and its own tsconfig", () => {
        const { json, packageJson } = run({ package: { name: "x", angularVersion: "^21.0.0" } });
        expect(json<unknown>("ng-package.json")).toEqual({
            $schema: "./node_modules/ng-packagr/ng-package.schema.json",
            dest: "dist",
            lib: { entryFile: "index.ts" },
        });
        expect(packageJson.scripts["build"]).toBe("ng-packagr -p ng-package.json -c tsconfig.json");
        expect(json<TsconfigShape>("tsconfig.json").angularCompilerOptions.compilationMode).toBe("partial");
    });

    describe("peer and dev dependencies", () => {
        it("derives peers from the generated imports, reduced to package roots", () => {
            const { packageJson, warnings } = run({ package: { name: "x", angularVersion: "^21.0.0" } });
            expect(packageJson.peerDependencies).toEqual({
                "@angular/common": "^21.0.0",
                "@angular/core": "^21.0.0",
                rxjs: "^7.4.0",
            });
            expect(packageJson.dependencies).toEqual({ tslib: "^2.3.0" });
            expect(warnings).toEqual([]);
        });

        it("adds zod to peers and devDependencies only when the code imports it", () => {
            const without = run({ package: { name: "x", angularVersion: "^21.0.0" } }).packageJson;
            expect(without.peerDependencies["zod"]).toBeUndefined();
            expect(without.devDependencies["zod"]).toBeUndefined();

            const withZod = run({
                package: { name: "x", angularVersion: "^21.0.0" },
                imports: ["@angular/core", "zod"],
            }).packageJson;
            expect(withZod.peerDependencies["zod"]).toBe("^4.0.0");
            expect(withZod.devDependencies["zod"]).toBe("^4.0.0");
        });

        it("keeps every Angular-family package and ng-packagr on the same major", () => {
            const { packageJson } = run({ package: { name: "x", angularVersion: ">=19.0.0 <22" } });
            expect(packageJson.peerDependencies["@angular/core"]).toBe(">=19.0.0 <22");
            expect(packageJson.devDependencies).toEqual({
                "@angular/common": "^19.0.0",
                "@angular/compiler": "^19.0.0",
                "@angular/compiler-cli": "^19.0.0",
                "@angular/core": "^19.0.0",
                "ng-packagr": "^19.0.0",
                rxjs: "^7.8.0",
                typescript: "~5.8.0",
            });
        });

        it("pins typescript to the range the Angular major accepts, and only for majors it knows", () => {
            // Peer auto-install would cover npm 7+, but not legacy-peer-deps, Yarn classic or npm 6
            expect(
                run({ package: { name: "x", angularVersion: "^21.0.0" } }).packageJson.devDependencies["typescript"],
            ).toBe("~5.9.0");
            expect(
                run({ package: { name: "x", angularVersion: "^17.0.0" } }).packageJson.devDependencies["typescript"],
            ).toBe("~5.4.0");
            // An unknown (future) major: no pin rather than a range that may conflict with compiler-cli's
            expect(
                run({ package: { name: "x", angularVersion: "^99.0.0" } }).packageJson.devDependencies["typescript"],
            ).toBeUndefined();
        });

        it('pins an import it has no range for to "*" and says so', () => {
            const { packageJson, warnings } = run({
                package: { name: "x", angularVersion: "^21.0.0" },
                imports: ["@angular/core", "@acme/runtime/helpers"],
            });
            expect(packageJson.peerDependencies["@acme/runtime"]).toBe("*");
            expect(warnings).toEqual([expect.stringContaining('imports "@acme/runtime"')]);
        });

        it("falls silent once the user supplies the range the warning asked for", () => {
            const { packageJson, warnings } = run({
                package: {
                    name: "x",
                    angularVersion: "^21.0.0",
                    packageJson: { peerDependencies: { "@acme/runtime": "^1.0.0" } },
                },
                imports: ["@angular/core", "@acme/runtime/helpers"],
            });
            expect(packageJson.peerDependencies["@acme/runtime"]).toBe("^1.0.0");
            expect(warnings).toEqual([]);
        });

        it("stamps the marker a later run recognizes its own package.json by", () => {
            const { packageJson } = run({ package: { name: "x", angularVersion: "^21.0.0" } });
            expect(packageJson.ngOpenapi).toEqual({ generated: true });
        });
    });

    describe("Angular version", () => {
        it("prefers the configured range, then the detected workspace major", () => {
            expect(
                run({ package: { name: "x", angularVersion: "^20.0.0" }, detectedAngularVersion: "21.2.13" })
                    .packageJson.peerDependencies["@angular/core"],
            ).toBe("^20.0.0");

            const detected = run({ package: { name: "x" }, detectedAngularVersion: "20.1.4" });
            expect(detected.packageJson.peerDependencies["@angular/core"]).toBe("^20.0.0");
            expect(detected.packageJson.devDependencies["ng-packagr"]).toBe("^20.0.0");
            expect(detected.warnings).toEqual([]);
        });

        it("does not let a detected Angular the build config cannot handle through silently", () => {
            // Angular 15 is within the core's peer range but predates the
            // TypeScript 5 the emitted tsconfig needs; a source-linked
            // placeholder version would otherwise yield ^0.0.0 everywhere
            for (const detectedAngularVersion of ["15.2.9", "0.0.0-PLACEHOLDER"]) {
                const { packageJson, warnings } = run({ package: { name: "x" }, detectedAngularVersion });
                expect(packageJson.peerDependencies["@angular/core"], detectedAngularVersion).toBe(
                    `^${DEFAULT_ANGULAR_MAJOR}.0.0`,
                );
                expect(packageJson.devDependencies["ng-packagr"], detectedAngularVersion).toBe(
                    `^${DEFAULT_ANGULAR_MAJOR}.0.0`,
                );
                expect(warnings, detectedAngularVersion).toEqual([
                    expect.stringContaining(`@angular/core ${detectedAngularVersion} found in this workspace is older`),
                ]);
            }
        });

        it("falls back to the generator's own supported major with a warning", () => {
            const { packageJson, warnings } = run({ package: { name: "x" } });
            expect(packageJson.peerDependencies["@angular/core"]).toBe(`^${DEFAULT_ANGULAR_MAJOR}.0.0`);
            expect(warnings).toEqual([expect.stringContaining("no @angular/core found")]);
        });

        it("keeps the fallback major in step with the Angular this workspace builds against", () => {
            // The constant claims to track the root @angular/core; a bump to one
            // without the other would silently regress the fallback
            const workspaceVersion = detectAngularCoreVersion();
            expect(workspaceVersion).toBeDefined();
            expect(leadingMajor(workspaceVersion as string)).toBe(DEFAULT_ANGULAR_MAJOR);
        });

        it("refuses a range it cannot read a major from instead of pairing it with the default toolchain", () => {
            // Validation rejects this before the generator runs; a caller that
            // skipped validation must not get a silently mismatched package.json
            expect(() => run({ package: { name: "x", angularVersion: "latest" } })).toThrow(ConfigValidationError);
        });
    });

    describe("version", () => {
        it("uses the configured version, else the spec's info.version, else 0.0.0", () => {
            const info = { version: "2.3.4" };
            expect(
                run({ package: { name: "x", version: "9.9.9", angularVersion: "^21.0.0" }, specInfo: info }).packageJson
                    .version,
            ).toBe("9.9.9");
            expect(run({ package: { name: "x", angularVersion: "^21.0.0" }, specInfo: info }).packageJson.version).toBe(
                "2.3.4",
            );
            for (const specInfo of [undefined, { version: "" }, { version: "  " }]) {
                const missing = run({ package: { name: "x", angularVersion: "^21.0.0" }, specInfo });
                expect(missing.packageJson.version).toBe("0.0.0");
                // Defaulting is as much a spec defect as a bad value; both are said
                expect(missing.warnings).toEqual([expect.stringContaining("the spec has no info.version")]);
            }
        });

        it("warns when the spec's version is not something npm will publish", () => {
            const { packageJson, warnings } = run({
                package: { name: "x", angularVersion: "^21.0.0" },
                specInfo: { version: "v1.0" },
            });
            expect(packageJson.version).toBe("v1.0");
            expect(warnings).toEqual([expect.stringContaining('"v1.0"')]);

            // The normalizer coerces an unquoted YAML `version: 1.0` to "1"
            // silently; here, where it is actually used, the hint explains why
            const coerced = run({ package: { name: "x", angularVersion: "^21.0.0" }, specInfo: { version: "1" } });
            expect(coerced.warnings).toEqual([expect.stringContaining("YAML reads that as a number")]);
        });
    });

    describe("package.json fields", () => {
        it("writes repository and publishConfig only when configured", () => {
            const minimal = run({ package: { name: "x", angularVersion: "^21.0.0" } }).packageJson;
            expect(minimal).not.toHaveProperty("repository");
            expect(minimal).not.toHaveProperty("publishConfig");
            expect(minimal.sideEffects).toBe(false);

            const full = run({
                package: {
                    name: "@acme/x",
                    angularVersion: "^21.0.0",
                    repository: { type: "git", url: "https://example.com/x.git" },
                    publishRegistry: "https://npm.example.com/",
                },
            }).packageJson;
            expect(full.repository).toEqual({ type: "git", url: "https://example.com/x.git" });
            expect(full.publishConfig).toEqual({ registry: "https://npm.example.com/" });
        });

        it("deep-merges packageJson overrides: nested maps merge, scalars and arrays replace", () => {
            const { packageJson } = run({
                package: {
                    name: "x",
                    angularVersion: "^21.0.0",
                    packageJson: {
                        license: "MIT",
                        files: ["dist"],
                        scripts: { release: "npm publish" },
                        peerDependencies: { rxjs: "^8.0.0" },
                        publishConfig: { access: "public" },
                    },
                },
            });
            expect(packageJson.license).toBe("MIT");
            expect(packageJson.files).toEqual(["dist"]);
            expect(packageJson.scripts).toEqual({
                build: "ng-packagr -p ng-package.json -c tsconfig.json",
                release: "npm publish",
            });
            // the override changed rxjs's range but could not drop the derived Angular peers
            expect(packageJson.peerDependencies).toEqual({
                "@angular/common": "^21.0.0",
                "@angular/core": "^21.0.0",
                rxjs: "^8.0.0",
            });
            expect(packageJson.publishConfig).toEqual({ access: "public" });
        });

        it("ignores undefined overrides instead of letting them delete a key", () => {
            const { packageJson } = run({
                package: {
                    name: "x",
                    angularVersion: "^21.0.0",
                    packageJson: { license: undefined, sideEffects: undefined },
                },
            });
            expect(packageJson.license).toBeUndefined();
            expect(packageJson.sideEffects).toBe(false);
        });

        it("honors an override of the build script but says what breaks", () => {
            const { packageJson, warnings } = run({
                package: {
                    name: "x",
                    angularVersion: "^21.0.0",
                    packageJson: { scripts: { build: "tsc" }, dependencies: { tslib: "^2.8.0" } },
                },
            });
            expect(packageJson.scripts["build"]).toBe("tsc");
            // Re-ranging tslib is harmless (validation keeps it a string): no warning for it
            expect(packageJson.dependencies["tslib"]).toBe("^2.8.0");
            expect(warnings).toEqual([expect.stringContaining("packageJson.scripts.build replaces the generated")]);
        });

        it("writes the spec's description as one line, only when there is one", () => {
            const withDescription = run({
                package: { name: "x", angularVersion: "^21.0.0" },
                specInfo: { description: "Orders,\n  returns and\trefunds.  " },
            }).packageJson;
            expect(withDescription.description).toBe("Orders, returns and refunds.");
            expect(run({ package: { name: "x", angularVersion: "^21.0.0" } }).packageJson).not.toHaveProperty(
                "description",
            );
        });
    });

    describe("README", () => {
        it("documents a types-only package without a provider the run never generated", () => {
            const readme = run({ package: { name: "x", angularVersion: "^21.0.0" }, providers: false }).text(
                "README.md",
            );
            expect(readme).toContain("model types only");
            expect(readme).not.toContain("provideDefaultClient");
        });

        it("documents the provider function the provider generator actually emits", () => {
            expect(run({ package: { name: "@acme/x", angularVersion: "^21.0.0" } }).text("README.md")).toContain(
                'import { provideDefaultClient } from "@acme/x"',
            );
            expect(
                run({ package: { name: "x", angularVersion: "^21.0.0" }, clientName: "pets-api" }).text("README.md"),
            ).toContain("providePetsApiClient({ basePath:");
        });

        it("names the API from the spec title when there is one", () => {
            const readme = run({
                package: { name: "x", angularVersion: "^21.0.0" },
                specInfo: { title: "Pet\nStore  API" },
            }).text("README.md");
            expect(readme).toContain("# x\n\nAngular client for Pet Store API, generated by");
            expect(run({ package: { name: "x", angularVersion: "^21.0.0" } }).text("README.md")).toContain(
                "# x\n\nAngular client generated by",
            );
        });
    });
});
