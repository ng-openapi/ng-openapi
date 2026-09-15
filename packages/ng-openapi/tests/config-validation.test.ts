import { describe, expect, it } from "vitest";
import { ConfigValidationError, validateGeneratorConfig } from "ng-openapi";

const validConfig = {
    input: "spec.json",
    output: "out",
    options: { dateType: "string", enumStyle: "union" },
};

const issuesOf = (config: unknown): readonly string[] => {
    try {
        validateGeneratorConfig(config);
        return [];
    } catch (error) {
        if (error instanceof ConfigValidationError) return error.issues;
        throw error;
    }
};

describe("validateGeneratorConfig", () => {
    it("accepts a minimal valid config", () => {
        expect(() => validateGeneratorConfig(validConfig)).not.toThrow();
    });

    it("accepts a fully-populated config", () => {
        expect(() =>
            validateGeneratorConfig({
                ...validConfig,
                clientName: "PetsApi",
                validateInput: () => true,
                options: {
                    dateType: "Date",
                    enumStyle: "enum",
                    generateServices: true,
                    generateEnumBasedOnDescription: false,
                    useSingleRequestParameter: true,
                    serviceDecorator: "service",
                    modelFileStructure: "per-type",
                    validation: { response: true },
                    customHeaders: { "X-Api-Key": "k" },
                    responseTypeMapping: { "application/pdf": "blob" },
                    customizeMethodName: (id: string) => id,
                    naming: {
                        services: { prefix: "Api" },
                        resources: { suffix: "ApiResource" },
                        models: { prefix: "Api", suffix: "Dto" },
                    },
                },
                plugins: [class {}],
            }),
        ).not.toThrow();
    });

    it("rejects non-object configs", () => {
        expect(() => validateGeneratorConfig(null)).toThrow(ConfigValidationError);
        expect(() => validateGeneratorConfig("config.json")).toThrow(ConfigValidationError);
    });

    it("requires input and output", () => {
        const issues = issuesOf({ options: validConfig.options });
        expect(issues.some((i) => i.includes("`input`"))).toBe(true);
        expect(issues.some((i) => i.includes("`output`"))).toBe(true);
    });

    it("rejects empty-string input/output", () => {
        expect(issuesOf({ ...validConfig, input: "  " }).some((i) => i.includes("`input`"))).toBe(true);
    });

    it("names the offending value for enum-like options", () => {
        const issues = issuesOf({
            ...validConfig,
            options: {
                dateType: "date",
                enumStyle: "unions",
                serviceDecorator: "Service",
                modelFileStructure: "split",
            },
        });
        expect(issues.find((i) => i.includes("dateType"))).toContain('"date"');
        expect(issues.find((i) => i.includes("enumStyle"))).toContain('"unions"');
        expect(issues.find((i) => i.includes("serviceDecorator"))).toContain('"Service"');
        expect(issues.find((i) => i.includes("modelFileStructure"))).toContain('"split"');
    });

    it("accepts an empty-string naming suffix (drops the default)", () => {
        expect(
            issuesOf({ ...validConfig, options: { ...validConfig.options, naming: { services: { suffix: "" } } } }),
        ).toEqual([]);
    });

    it("validates naming decorations as identifier fragments", () => {
        const issues = issuesOf({
            ...validConfig,
            options: {
                ...validConfig.options,
                naming: {
                    services: { prefix: "1Bad" },
                    resources: "Api",
                    models: { suffix: "My-Dto" },
                },
            },
        });
        expect(issues.find((i) => i.includes("naming.services.prefix"))).toContain('"1Bad"');
        expect(issues.some((i) => i.includes("`options.naming.resources`"))).toBe(true);
        expect(issues.find((i) => i.includes("naming.models.suffix"))).toContain('"My-Dto"');
    });

    it("rejects a non-object naming option", () => {
        const issues = issuesOf({ ...validConfig, options: { ...validConfig.options, naming: "Api" } });
        expect(issues.some((i) => i.includes("`options.naming`"))).toBe(true);
    });

    it("validates option value types", () => {
        const issues = issuesOf({
            ...validConfig,
            options: {
                ...validConfig.options,
                generateServices: "yes",
                customizeMethodName: "rename",
                customHeaders: { Good: "ok", Bad: 42 },
                responseTypeMapping: { "text/csv": "csv" },
                validation: true,
            },
        });
        expect(issues.some((i) => i.includes("generateServices"))).toBe(true);
        expect(issues.some((i) => i.includes("customizeMethodName"))).toBe(true);
        expect(issues.some((i) => i.includes('customHeaders["Bad"]'))).toBe(true);
        expect(issues.some((i) => i.includes('responseTypeMapping["text/csv"]'))).toBe(true);
        expect(issues.some((i) => i.includes("validation"))).toBe(true);
    });

    it("validates plugins as an array of classes", () => {
        expect(issuesOf({ ...validConfig, plugins: "zod" }).some((i) => i.includes("`plugins`"))).toBe(true);
        expect(issuesOf({ ...validConfig, plugins: ["zod"] }).some((i) => i.includes("plugins[0]"))).toBe(true);
    });

    it("aggregates every issue into one error message", () => {
        try {
            validateGeneratorConfig({});
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(ConfigValidationError);
            expect((error as ConfigValidationError).issues.length).toBeGreaterThanOrEqual(3);
            expect((error as Error).message).toContain("Invalid ng-openapi configuration");
        }
    });
    it("accepts any string as clientName", () => {
        // Free-form on purpose: every identifier derived from it is sanitized
        // downstream, and "my-client" generated fine before — rejecting it here
        // was a breaking change. The only structural requirement is the type.
        for (const clientName of ["PetsApi", "_internal", "my-client", "a.b", "2fa", "My (Api)"]) {
            expect(issuesOf({ ...validConfig, clientName }), clientName).toEqual([]);
        }
        expect(issuesOf({ ...validConfig, clientName: 42 })).toContainEqual(expect.stringContaining("`clientName`"));
    });

    describe("package", () => {
        const withPackage = (pkg: unknown) => issuesOf({ ...validConfig, package: pkg });

        it("accepts a minimal and a fully-populated package config", () => {
            expect(withPackage({ name: "my-client" })).toEqual([]);
            expect(
                withPackage({
                    name: "@acme/petstore-client",
                    version: "1.2.3-beta.1+build.5",
                    repository: { type: "git", url: "https://github.com/acme/petstore-client.git", directory: "pkg" },
                    publishRegistry: "https://npm.acme.internal/",
                    angularVersion: ">=19.0.0 <22",
                    packageJson: { license: "MIT", publishConfig: { access: "restricted" } },
                }),
            ).toEqual([]);
            expect(withPackage({ name: "x", repository: "github:acme/x" })).toEqual([]);
        });

        it("requires the object shape", () => {
            expect(withPackage("my-client")).toContainEqual(expect.stringContaining("`package` must be an object"));
            expect(withPackage(null)).toContainEqual(expect.stringContaining("`package` must be an object"));
        });

        it("requires a valid npm package name", () => {
            for (const name of [undefined, "", "My Client", "UPPER", "@scope", "scope/", ".hidden"]) {
                expect(withPackage({ name }), JSON.stringify(name)).toContainEqual(
                    expect.stringContaining("`package.name`"),
                );
            }
        });

        it("requires an explicit version to be semver", () => {
            expect(withPackage({ name: "x", version: "1.0" })).toContainEqual(
                expect.stringContaining("`package.version`"),
            );
            expect(withPackage({ name: "x", version: 1 })).toContainEqual(expect.stringContaining("`package.version`"));
        });

        it("validates repository, publishRegistry and angularVersion shapes", () => {
            expect(withPackage({ name: "x", repository: 42 })).toContainEqual(
                expect.stringContaining("`package.repository`"),
            );
            expect(withPackage({ name: "x", repository: { url: "u" } })).toContainEqual(
                expect.stringContaining("`package.repository` object form"),
            );
            expect(withPackage({ name: "x", publishRegistry: "npm.acme.internal" })).toContainEqual(
                expect.stringContaining("`package.publishRegistry`"),
            );
            expect(withPackage({ name: "x", angularVersion: "latest" })).toContainEqual(
                expect.stringContaining("`package.angularVersion`"),
            );
            expect(withPackage({ name: "x", angularVersion: "^20.0.0" })).toEqual([]);
            expect(withPackage({ name: "x", angularVersion: "21" })).toEqual([]);
        });

        it("rejects packageJson that is not an object or that overrides a first-class field", () => {
            expect(withPackage({ name: "x", packageJson: [] })).toContainEqual(
                expect.stringContaining("`package.packageJson` must be an object"),
            );
            expect(withPackage({ name: "x", packageJson: { name: "y" } })).toContainEqual(
                expect.stringContaining("`package.packageJson.name` is not allowed — set `package.name`"),
            );
            expect(withPackage({ name: "x", packageJson: { version: "1.0" } })).toContainEqual(
                expect.stringContaining("`package.packageJson.version` is not allowed"),
            );
            expect(withPackage({ name: "x", packageJson: { repository: "github:acme/x" } })).toContainEqual(
                expect.stringContaining("`package.packageJson.repository` is not allowed — set `package.repository`"),
            );
            // A copied config with both would publish to a registry nobody chose
            expect(
                withPackage({ name: "x", packageJson: { publishConfig: { registry: "https://npm.example.com" } } }),
            ).toContainEqual(
                expect.stringContaining(
                    "`package.packageJson.publishConfig.registry` is not allowed — set `package.publishRegistry`",
                ),
            );
            expect(withPackage({ name: "x", packageJson: { publishConfig: { access: "public" } } })).toEqual([]);
        });

        it("accepts undefined override values, since the merge skips them", () => {
            // `license: process.env["LICENSE"]` with the variable unset is the documented pattern
            expect(
                withPackage({
                    name: "x",
                    packageJson: {
                        license: undefined,
                        peerDependencies: { rxjs: undefined },
                        nested: { a: undefined },
                    },
                }),
            ).toEqual([]);
        });

        it("anchors angularVersion to one readable range at or above the oldest supported major", () => {
            for (const range of ["^20.0.0", "~21.1", ">=19.0.0 <22", "21", "16", "16.2"]) {
                expect(withPackage({ name: "x", angularVersion: range }), range).toEqual([]);
            }
            for (const range of ["21abc", "^20.0.0 and up", "^20 || ^21", "latest", "20.0.0.0", ""]) {
                expect(withPackage({ name: "x", angularVersion: range }), JSON.stringify(range)).toContainEqual(
                    expect.stringContaining("must be a single semver range"),
                );
            }
            for (const range of ["15", "^1.0.0", "0"]) {
                expect(withPackage({ name: "x", angularVersion: range }), range).toContainEqual(
                    expect.stringContaining("must target Angular 16 or later"),
                );
            }
        });

        it("requires dependency maps and scripts in packageJson to be objects of non-empty strings", () => {
            // Replacing a map wholesale is how a derived peer could be dropped
            for (const bad of [null, [], "rxjs"]) {
                expect(
                    withPackage({ name: "x", packageJson: { peerDependencies: bad } }),
                    JSON.stringify(bad),
                ).toContainEqual(
                    expect.stringContaining(
                        "`package.packageJson.peerDependencies` must be an object of name → string",
                    ),
                );
            }
            expect(withPackage({ name: "x", packageJson: { peerDependencies: { rxjs: null } } })).toContainEqual(
                expect.stringContaining('`package.packageJson.peerDependencies["rxjs"]` must be a non-empty string'),
            );
            expect(withPackage({ name: "x", packageJson: { scripts: { build: "" } } })).toContainEqual(
                expect.stringContaining('`package.packageJson.scripts["build"]` must be a non-empty string'),
            );
            expect(withPackage({ name: "x", packageJson: { dependencies: { tslib: "^2.0.0" } } })).toEqual([]);
        });

        it("rejects packageJson values JSON.stringify would drop, mangle or choke on", () => {
            expect(withPackage({ name: "x", packageJson: { funding: () => "x" } })).toContainEqual(
                expect.stringContaining("`package.packageJson.funding` must be a JSON value"),
            );
            expect(withPackage({ name: "x", packageJson: { stamp: new Date() } })).toContainEqual(
                expect.stringContaining("`package.packageJson.stamp` must be a JSON value"),
            );
            expect(withPackage({ name: "x", packageJson: { nested: { list: [1, Number.NaN] } } })).toContainEqual(
                expect.stringContaining("`package.packageJson.nested.list[1]` must be a finite number"),
            );
            expect(
                withPackage({ name: "x", packageJson: JSON.parse('{"__proto__": {"polluted": true}}') }),
            ).toContainEqual(expect.stringContaining('must not contain a "__proto__" key'));
            expect(
                withPackage({
                    name: "x",
                    packageJson: { keywords: ["api", "angular"], private: false, deprecated: null, tags: { a: 1 } },
                }),
            ).toEqual([]);
        });
    });
});
