import { describe, expect, it } from "vitest";
import { StructureKind } from "ts-morph";
import type { SwaggerDefinition, TypeGenOptions } from "@ng-openapi/shared";
import { escapeString, sanitizePropertyName, TypeResolver } from "../src/lib/generators/type/type-resolver";
import { EnumBuilder, toEnumKey } from "../src/lib/generators/type/enum-builder";
import { InterfaceBuilder } from "../src/lib/generators/type/interface-builder";
import { buildSdkTypes } from "../src/lib/generators/type/sdk-types";

const baseConfig: TypeGenOptions = {
    options: { dateType: "string", enumStyle: "enum" },
};

const resolver = () => new TypeResolver(baseConfig);

describe("escapeString / sanitizePropertyName", () => {
    it("escapes backslashes and single quotes", () => {
        expect(escapeString("it's a \\ test")).toBe("it\\'s a \\\\ test");
    });

    it("quotes property names that are not valid identifiers", () => {
        expect(sanitizePropertyName("valid_name$")).toBe("valid_name$");
        expect(sanitizePropertyName("kebab-case")).toBe('"kebab-case"');
        expect(sanitizePropertyName("123abc")).toBe('"123abc"');
    });
});

describe("TypeResolver", () => {
    it("maps primitives", () => {
        expect(resolver().resolve({ type: "string" })).toBe("string");
        expect(resolver().resolve({ type: "integer" })).toBe("number");
        expect(resolver().resolve({ type: "boolean" })).toBe("boolean");
    });

    it("maps date formats according to dateType", () => {
        expect(resolver().resolve({ type: "string", format: "date-time" })).toBe("string");
        const dateResolver = new TypeResolver({ options: { dateType: "Date" } });
        expect(dateResolver.resolve({ type: "string", format: "date-time" })).toBe("Date");
    });

    it("maps binary to Blob and appends null for nullable schemas", () => {
        expect(resolver().resolve({ type: "string", format: "binary" })).toBe("Blob");
        expect(resolver().resolve({ type: "string", nullable: true })).toBe("string | null");
    });

    it("resolves $refs to pascal-cased names", () => {
        expect(resolver().resolve({ $ref: "#/components/schemas/user_profile" })).toBe("UserProfile");
    });

    it("renders inline enums as literal unions", () => {
        expect(resolver().resolve({ enum: ["a", "b"] } as SwaggerDefinition)).toBe("'a' | 'b'");
        expect(resolver().resolve({ enum: [1, 2] } as SwaggerDefinition)).toBe("1 | 2");
    });

    it("combines allOf/oneOf/anyOf", () => {
        const a: SwaggerDefinition = { $ref: "#/definitions/A" };
        const b: SwaggerDefinition = { $ref: "#/definitions/B" };
        expect(resolver().resolve({ allOf: [a, b] })).toBe("A & B");
        expect(resolver().resolve({ oneOf: [a, b] })).toBe("A | B");
        expect(resolver().resolve({ anyOf: [a, b] })).toBe("A | B");
    });

    it("deduplicates oneOf members", () => {
        const a: SwaggerDefinition = { type: "string" };
        const b: SwaggerDefinition = { type: "string" };
        expect(resolver().resolve({ oneOf: [a, b] })).toBe("string");
    });

    it("renders arrays and tuples", () => {
        expect(resolver().resolve({ type: "array", items: { type: "number" } })).toBe("Array<number>");
        expect(resolver().getArrayItemType([{ type: "string" }, { type: "number" }])).toBe("[string, number]");
    });

    it("renders inline objects with sanitized keys and requiredness", () => {
        const schema: SwaggerDefinition = {
            type: "object",
            required: ["id"],
            properties: {
                id: { type: "number" },
                "display-name": { type: "string" },
            },
        };
        expect(resolver().resolve(schema)).toBe('{ id: number; "display-name"?: string }');
    });

    it("renders additionalProperties as Record", () => {
        expect(resolver().resolve({ type: "object", additionalProperties: { type: "string" } })).toBe(
            "Record<string, string>",
        );
        expect(resolver().resolve({ type: "object" })).toBe("Record<string, unknown>");
    });

    it("handles JSON-Schema type arrays (3.1 style)", () => {
        expect(resolver().resolve({ type: ["string", "null"] as unknown as string })).toBe("string | null");
    });
});

describe("TypeResolver.withReferenceTracking", () => {
    it("records $refs resolved anywhere inside the tracked call, raw names untouched", () => {
        const r = resolver();
        const references = new Set<string>();
        r.withReferenceTracking(references, () =>
            r.resolve({
                type: "object",
                properties: {
                    owner: { $ref: "#/components/schemas/user_profile" },
                    tags: { type: "array", items: { $ref: "#/definitions/Tag" } },
                    variant: { oneOf: [{ $ref: "#/definitions/A" }, { type: "string" }] },
                },
            }),
        );
        expect([...references].sort()).toEqual(["A", "Tag", "user_profile"]);
    });

    it("does not record outside a tracked call and restores the previous sink", () => {
        const r = resolver();
        const outer = new Set<string>();
        const inner = new Set<string>();
        r.withReferenceTracking(outer, () => {
            r.withReferenceTracking(inner, () => r.resolve({ $ref: "#/definitions/Inner" }));
            r.resolve({ $ref: "#/definitions/Outer" });
        });
        r.resolve({ $ref: "#/definitions/Untracked" });
        expect([...inner]).toEqual(["Inner"]);
        expect([...outer]).toEqual(["Outer"]);
    });

    it("records a reference even when the schema resolution is cached", () => {
        const r = resolver();
        const schema: SwaggerDefinition = { $ref: "#/definitions/Cached" };
        r.resolve(schema); // primes the cache, untracked
        const references = new Set<string>();
        r.withReferenceTracking(references, () => r.resolve(schema));
        expect([...references]).toEqual(["Cached"]);
    });
});

describe("toEnumKey", () => {
    it("pascal-cases values and guards leading digits", () => {
        expect(toEnumKey("in progress")).toBe("InProgress");
        expect(toEnumKey(1)).toBe("_1");
        expect(toEnumKey(-2)).toBe("_n2");
    });
});

describe("EnumBuilder", () => {
    it("returns no statements for empty enums", () => {
        expect(new EnumBuilder(baseConfig).build("Empty", { enum: [] } as SwaggerDefinition)).toEqual([]);
    });

    it("builds a TS enum in enum style", () => {
        const [statement] = new EnumBuilder(baseConfig).build("Status", {
            enum: ["active", "inactive"],
        } as SwaggerDefinition);
        expect(statement).toMatchObject({
            kind: StructureKind.Enum,
            name: "Status",
            members: [
                { name: "Active", value: "active" },
                { name: "Inactive", value: "inactive" },
            ],
        });
    });

    it("builds a union type + const in union style", () => {
        const unionConfig: TypeGenOptions = { options: { dateType: "string", enumStyle: "union" } };
        const [alias, constant] = new EnumBuilder(unionConfig).build("Status", {
            enum: ["active"],
        } as SwaggerDefinition);
        expect(alias).toMatchObject({ kind: StructureKind.TypeAlias, name: "Status", type: "'active'" });
        expect(constant).toMatchObject({ kind: StructureKind.VariableStatement });
    });

    it("warns when a JSON-looking description fails to parse, stays quiet on prose", () => {
        const config: TypeGenOptions = {
            options: { dateType: "string", enumStyle: "enum", generateEnumBasedOnDescription: true },
        };
        const warnings: string[] = [];
        const builder = new EnumBuilder(config, (message) => warnings.push(message));

        // Trailing comma → intended-but-malformed JSON payload
        builder.build("Kind", {
            enum: [1, 2],
            description: '[{"Name":"First","Value":1},]',
        } as SwaggerDefinition);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Enum "Kind"');

        // Prose descriptions are expected to fail JSON.parse silently
        builder.build("Other", {
            enum: [1, 2],
            description: "Plain human-readable description",
        } as SwaggerDefinition);
        expect(warnings).toHaveLength(1);
    });

    it("uses description-encoded members when generateEnumBasedOnDescription is set", () => {
        const config: TypeGenOptions = {
            options: { dateType: "string", enumStyle: "enum", generateEnumBasedOnDescription: true },
        };
        const [statement] = new EnumBuilder(config).build("Kind", {
            enum: [1, 2],
            description: '[{"Name":"First","Value":1},{"Name":"Second","Value":2}]',
        } as SwaggerDefinition);
        expect(statement).toMatchObject({
            members: [
                { name: "First", value: 1 },
                { name: "Second", value: 2 },
            ],
        });
    });
});

describe("InterfaceBuilder", () => {
    const builder = () => new InterfaceBuilder(resolver());

    it("builds properties with requiredness, readonly and docs", () => {
        const properties = builder().buildProperties({
            required: ["id"],
            properties: {
                id: { type: "number", readOnly: true },
                name: { type: "string", description: "Display name" },
            },
        });
        expect(properties).toEqual([
            { name: "id", type: "number", isReadonly: true, hasQuestionToken: false, docs: undefined },
            { name: "name", type: "string", isReadonly: undefined, hasQuestionToken: true, docs: ["Display name"] },
        ]);
    });

    it("emits index signatures for property-less definitions", () => {
        expect(builder().buildIndexSignatures({ additionalProperties: false })[0].returnType).toBe("never");
        expect(builder().buildIndexSignatures({ additionalProperties: true })[0].returnType).toBe("any");
        expect(builder().buildIndexSignatures({})[0].returnType).toBe("unknown");
        expect(builder().buildIndexSignatures({ properties: { a: { type: "string" } } })).toEqual([]);
    });
});

describe("buildSdkTypes", () => {
    it("emits RequestOptions without parse by default", () => {
        const [statement] = buildSdkTypes(baseConfig);
        expect(statement).toMatchObject({ kind: StructureKind.Interface, name: "RequestOptions" });
        const names = (statement as { properties: { name: string }[] }).properties.map((p) => p.name);
        expect(names).not.toContain("parse");
    });

    it("adds parse + TReturnType when response validation is on", () => {
        const config: TypeGenOptions = {
            options: { dateType: "string", enumStyle: "enum", validation: { response: true } },
        };
        const [statement] = buildSdkTypes(config);
        const typed = statement as { properties: { name: string }[]; typeParameters: string[] };
        expect(typed.properties.map((p) => p.name)).toContain("parse");
        expect(typed.typeParameters).toContain("TReturnType");
    });
});
