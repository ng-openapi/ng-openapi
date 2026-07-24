import { describe, expect, it } from "vitest";
import { inlineNestedRefs, SwaggerSpec } from "../src";

const policyEntrySchemas = {
    PolicyEntry: {
        type: "object",
        properties: {
            namespaces: {
                type: "array",
                description: "Namespace patterns this policy entry applies to.",
                items: { type: "string" },
            },
        },
    },
} as const;

describe("inlineNestedRefs", () => {
    it("inlines a deep-pointer $ref in an operation response with a copy of the target", () => {
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                "/ns": {
                    get: {
                        responses: {
                            "200": {
                                description: "ok",
                                content: {
                                    "application/json": {
                                        schema: { $ref: "#/components/schemas/PolicyEntry/properties/namespaces" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: { schemas: policyEntrySchemas },
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);
        const schema = result.paths["/ns"].get?.responses?.["200"]?.content?.["application/json"]?.schema;

        expect(schema).toEqual({
            type: "array",
            description: "Namespace patterns this policy entry applies to.",
            items: { type: "string" },
        });
        // A copy, not the original node — mutating the target must not leak.
        expect(schema).not.toBe(spec.components?.schemas?.["PolicyEntry"]?.properties?.["namespaces"]);
    });

    it("inlines a deep-pointer $ref in a Swagger 2.0 request body", () => {
        const spec = {
            swagger: "2.0",
            info: { title: "t", version: "1" },
            paths: {
                "/ns": {
                    put: {
                        parameters: [
                            { name: "body", in: "body", schema: { $ref: "#/definitions/PolicyEntry/properties/namespaces" } },
                        ],
                        responses: { "204": { description: "updated" } },
                    },
                },
            },
            definitions: policyEntrySchemas,
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);
        const schema = result.paths["/ns"].put?.parameters?.[0]?.schema;

        expect(schema).toEqual({
            type: "array",
            description: "Namespace patterns this policy entry applies to.",
            items: { type: "string" },
        });
    });

    it("leaves plain top-level $refs untouched so they keep importing a model", () => {
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                "/pet": {
                    get: {
                        responses: {
                            "200": {
                                description: "ok",
                                content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
                            },
                        },
                    },
                },
            },
            components: { schemas: { Pet: { type: "object", properties: { name: { type: "string" } } } } },
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);
        const schema = result.paths["/pet"].get?.responses?.["200"]?.content?.["application/json"]?.schema;

        expect(schema).toEqual({ $ref: "#/components/schemas/Pet" });
    });

    it("leaves an unresolvable deep pointer as-is rather than throwing", () => {
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                "/x": {
                    get: {
                        responses: {
                            "200": {
                                description: "ok",
                                content: {
                                    "application/json": {
                                        schema: { $ref: "#/components/schemas/Missing/properties/nope" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: { schemas: {} },
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);
        const schema = result.paths["/x"].get?.responses?.["200"]?.content?.["application/json"]?.schema;

        expect(schema).toEqual({ $ref: "#/components/schemas/Missing/properties/nope" });
    });

    it("does not recurse forever on a self-referential deep pointer", () => {
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Loop: {
                        type: "object",
                        properties: {
                            self: { $ref: "#/components/schemas/Loop/properties/self" },
                        },
                    },
                },
            },
        } as unknown as SwaggerSpec;

        // Would blow the stack if the cycle guard were missing.
        expect(() => inlineNestedRefs(spec)).not.toThrow();
    });
});
