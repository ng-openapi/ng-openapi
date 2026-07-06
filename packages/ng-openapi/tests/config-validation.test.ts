import { describe, expect, it } from "vitest";
import { ConfigValidationError, validateGeneratorConfig } from "ng-openapi";

const validConfig = {
    input: "spec.json",
    output: "out",
    options: { dateType: "string", enumStyle: "union" },
};

const issuesOf = (config: unknown): string[] => {
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
            options: { dateType: "date", enumStyle: "unions", serviceDecorator: "Service" },
        });
        expect(issues.find((i) => i.includes("dateType"))).toContain('"date"');
        expect(issues.find((i) => i.includes("enumStyle"))).toContain('"unions"');
        expect(issues.find((i) => i.includes("serviceDecorator"))).toContain('"Service"');
    });

    it("accepts an empty-string naming suffix (drops the default)", () => {
        expect(issuesOf({ ...validConfig, options: { ...validConfig.options, naming: { services: { suffix: "" } } } })).toEqual(
            [],
        );
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
});
