import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
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

const composedSchemas = {
    Envelope: {
        allOf: [
            { type: "object", properties: { id: { type: "string" } } },
            { type: "object", properties: { payload: { type: "array", items: { type: "number" } } } },
        ],
    },
} as const;

/** A 3.x spec whose single operation response schema is `{ $ref: ref }`. */
function specWithResponseRef(ref: string, schemas: unknown): SwaggerSpec {
    return {
        openapi: "3.0.0",
        info: { title: "t", version: "1" },
        paths: {
            "/x": {
                get: {
                    responses: {
                        "200": {
                            description: "ok",
                            content: { "application/json": { schema: { $ref: ref } } },
                        },
                    },
                },
            },
        },
        components: { schemas },
    } as unknown as SwaggerSpec;
}

function responseSchema(spec: SwaggerSpec): unknown {
    return spec.paths["/x"].get?.responses?.["200"]?.content?.["application/json"]?.schema;
}

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
                            {
                                name: "body",
                                in: "body",
                                schema: { $ref: "#/definitions/PolicyEntry/properties/namespaces" },
                            },
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

    it("leaves an unresolvable deep pointer as-is rather than throwing, and warns with the ref", () => {
        const ref = "#/components/schemas/Missing/properties/nope";
        const spec = specWithResponseRef(ref, {});
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(ref);
        expect(warnings[0]).toContain("will not compile");
    });

    it("warns once per ref, however many sites use it", () => {
        const ref = "#/components/schemas/Missing/properties/nope";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                "/a": { get: { responses: { "200": { description: "ok", schema: { $ref: ref } } } } },
                "/b": { get: { responses: { "200": { description: "ok", schema: { $ref: ref } } } } },
            },
            components: { schemas: {} },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(warnings).toHaveLength(1);
    });

    it("stays silent when every deep pointer resolves", () => {
        const spec = specWithResponseRef("#/components/schemas/PolicyEntry/properties/namespaces", policyEntrySchemas);
        const warnings: string[] = [];

        inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(warnings).toEqual([]);
    });

    it("does not resolve a pointer through the prototype chain", () => {
        // `"toString" in {}` is true — an own-property check is what keeps this
        // from "resolving" to a function and throwing DataCloneError out of
        // structuredClone.
        const ref = "#/components/schemas/__proto__/toString";
        const spec = specWithResponseRef(ref, policyEntrySchemas);
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings).toHaveLength(1);
    });

    it("inlines a deep pointer whose target itself contains another deep pointer", () => {
        const spec = specWithResponseRef("#/components/schemas/A/properties/x", {
            A: { type: "object", properties: { x: { $ref: "#/components/schemas/B/properties/y" } } },
            B: { type: "object", properties: { y: { type: "array", items: { type: "string" } } } },
        });

        // A plain `structuredClone(target)` without the recursive step would
        // leave the inner `$ref` here — the exact bug this PR fixes.
        expect(responseSchema(inlineNestedRefs(spec))).toEqual({ type: "array", items: { type: "string" } });
    });

    it("keeps a plain top-level $ref inside an inlined target verbatim", () => {
        const spec = specWithResponseRef("#/components/schemas/A/properties/tags", {
            A: {
                type: "object",
                properties: { tags: { type: "array", items: { $ref: "#/components/schemas/Tag" } } },
            },
            Tag: { type: "object", properties: { name: { type: "string" } } },
        });

        // The inner ref must survive — it is what drives the model import.
        expect(responseSchema(inlineNestedRefs(spec))).toEqual({
            type: "array",
            items: { $ref: "#/components/schemas/Tag" },
        });
    });

    it("inlines a self-referential deep pointer once and preserves the innermost $ref", () => {
        const wrapperRef = "#/components/schemas/Loop/properties/wrapper";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Loop: {
                        type: "object",
                        properties: {
                            self: { $ref: wrapperRef },
                            wrapper: { type: "array", items: { $ref: wrapperRef } },
                        },
                    },
                },
            },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        // Would blow the stack if the cycle guard were missing.
        const result = inlineNestedRefs(spec, (message) => warnings.push(message));
        const properties = result.components?.schemas?.["Loop"]?.properties as Record<string, unknown>;

        // Expanded exactly one level; the ref that would close the loop stays.
        expect(properties["self"]).toEqual({ type: "array", items: { $ref: wrapperRef } });
        expect(properties["wrapper"]).toEqual({
            type: "array",
            items: { type: "array", items: { $ref: wrapperRef } },
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(wrapperRef);
        expect(warnings[0]).toContain("cyclic");
    });

    it("terminates on a mutual cycle between two deep pointers", () => {
        const aToB = "#/components/schemas/B/properties/toA";
        const bToA = "#/components/schemas/A/properties/toB";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {},
            components: {
                schemas: {
                    A: { type: "object", properties: { toB: { $ref: aToB } } },
                    B: { type: "object", properties: { toA: { $ref: bToA } } },
                },
            },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        // `chain` must span both hops — a one-ref guard would recurse forever.
        const result = inlineNestedRefs(spec, (message) => warnings.push(message));
        const schemas = result.components?.schemas as Record<string, { properties: Record<string, unknown> }>;

        expect(schemas["A"].properties["toB"]).toEqual({ $ref: aToB });
        expect(schemas["B"].properties["toA"]).toEqual({ $ref: bToA });
        expect(warnings.some((message) => message.includes("cyclic"))).toBe(true);
    });

    it("returns a spec without deep pointers as the very same object graph", () => {
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

        expect(inlineNestedRefs(spec)).toBe(spec);
    });

    it("leaves a subtree with no deep pointer under it untouched by reference", () => {
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
                "/pet": { get: { responses: { "200": { description: "ok" } } } },
            },
            components: { schemas: policyEntrySchemas },
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);

        // The rewritten branch is a new object…
        expect(result.paths["/ns"]).not.toBe(spec.paths["/ns"]);
        // …while the sibling that contains no deep pointer is the original node.
        expect(result.paths["/pet"]).toBe(spec.paths["/pet"]);
        expect(result.info).toBe(spec.info);
    });

    it("preserves Date values that js-yaml's default schema produces for unquoted timestamps", () => {
        // js-yaml (default schema) turns `example: 2020-01-01` into a Date.
        // Object.entries(new Date()) is [], so a loose plain-object check would
        // silently rebuild it as {} — a regression for any YAML spec, deep refs
        // or not.
        const spec = yaml.load(`
openapi: 3.0.0
info:
  title: t
  version: "1"
paths:
  /ns:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PolicyEntry/properties/namespaces"
components:
  schemas:
    PolicyEntry:
      type: object
      properties:
        namespaces:
          type: array
          items:
            type: string
        createdAt:
          type: string
          format: date-time
          example: 2020-01-01
          default: 2020-01-01T00:00:00Z
`) as SwaggerSpec;

        const createdAt = spec.components?.schemas?.["PolicyEntry"]?.properties?.["createdAt"] as Record<
            string,
            unknown
        >;
        // Guard the premise: js-yaml really does hand us Dates here.
        expect(createdAt["example"]).toBeInstanceOf(Date);
        expect(createdAt["default"]).toBeInstanceOf(Date);

        const result = inlineNestedRefs(spec);
        const resultCreatedAt = result.components?.schemas?.["PolicyEntry"]?.properties?.["createdAt"] as Record<
            string,
            unknown
        >;

        // Same instances, not flattened to {} and not cloned.
        expect(resultCreatedAt["example"]).toBe(createdAt["example"]);
        expect(resultCreatedAt["default"]).toBe(createdAt["default"]);
    });

    it("preserves a Date inside the subtree an inlined deep pointer copies", () => {
        const example = new Date("2020-01-01T00:00:00Z");
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
                                        schema: { $ref: "#/components/schemas/Audit/properties/createdAt" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    Audit: {
                        type: "object",
                        properties: {
                            createdAt: { type: "string", format: "date-time", example },
                        },
                    },
                },
            },
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);
        const schema = result.paths["/ns"].get?.responses?.["200"]?.content?.["application/json"]?.schema as Record<
            string,
            unknown
        >;

        // structuredClone copies Dates as Dates — a copy, but still a real Date.
        expect(schema["example"]).toBeInstanceOf(Date);
        expect((schema["example"] as Date).toISOString()).toBe(example.toISOString());
    });

    it("walks array indices in a pointer, so composition keywords are reachable", () => {
        const spec = specWithResponseRef("#/components/schemas/Envelope/allOf/1/properties/payload", composedSchemas);

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({ type: "array", items: { type: "number" } });
    });

    it("inlines an array element addressed by index", () => {
        const spec = specWithResponseRef("#/components/schemas/Envelope/allOf/0", composedSchemas);

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({
            type: "object",
            properties: { id: { type: "string" } },
        });
    });

    it("walks array indices in a Swagger 2.0 pointer", () => {
        const spec = {
            swagger: "2.0",
            info: { title: "t", version: "1" },
            paths: {
                "/ns": {
                    put: {
                        parameters: [
                            {
                                name: "body",
                                in: "body",
                                schema: { $ref: "#/definitions/Envelope/allOf/1/properties/payload" },
                            },
                        ],
                        responses: { "204": { description: "updated" } },
                    },
                },
            },
            definitions: composedSchemas,
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);

        expect(result.paths["/ns"].put?.parameters?.[0]?.schema).toEqual({ type: "array", items: { type: "number" } });
    });

    it("leaves an out-of-range array index as-is", () => {
        const ref = "#/components/schemas/Envelope/allOf/5";
        const spec = specWithResponseRef(ref, composedSchemas);

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({ $ref: ref });
    });

    it("leaves a non-index segment against an array as-is", () => {
        const ref = "#/components/schemas/Envelope/allOf/first";
        const spec = specWithResponseRef(ref, composedSchemas);

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({ $ref: ref });
    });

    it("leaves a leading-zero array index as-is — RFC 6901 does not address it", () => {
        const ref = "#/components/schemas/Envelope/allOf/01";
        const spec = specWithResponseRef(ref, composedSchemas);

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({ $ref: ref });
    });

    it("leaves the past-the-end `-` array segment as-is", () => {
        const ref = "#/components/schemas/Envelope/allOf/-";
        const spec = specWithResponseRef(ref, composedSchemas);

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({ $ref: ref });
    });
});
