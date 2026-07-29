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

/** Overwrites the schema `specWithResponseRef` built, for the odd shapes below. */
function setResponseSchema(spec: SwaggerSpec, schema: unknown): void {
    const mediaType = spec.paths["/x"].get?.responses?.["200"]?.content?.["application/json"] as Record<
        string,
        unknown
    >;
    mediaType["schema"] = schema;
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
        // Not "will not compile": generated files ship @ts-nocheck, so the
        // consumer's build stays green and the type is merely wrong.
        expect(warnings[0]).toContain("silently wrong type");
        expect(warnings[0]).not.toContain("will not compile");
    });

    it("keeps keys sitting next to a deep $ref, and lets them win over the target's", () => {
        const spec = specWithResponseRef("#/components/schemas/PolicyEntry/properties/namespaces", policyEntrySchemas);
        setResponseSchema(spec, {
            $ref: "#/components/schemas/PolicyEntry/properties/namespaces",
            description: "Only the namespaces this token may touch.",
            nullable: true,
        });

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({
            type: "array",
            items: { type: "string" },
            // Local annotation wins over the target's own description.
            description: "Only the namespaces this token may touch.",
            nullable: true,
        });
    });

    it("inlines a deep $ref sitting in a sibling key of another deep $ref", () => {
        const spec = specWithResponseRef("#/components/schemas/A/properties/n", {
            A: { type: "object", properties: { n: { type: "array" } } },
            B: { type: "object", properties: { m: { type: "string" } } },
        });
        setResponseSchema(spec, {
            $ref: "#/components/schemas/A/properties/n",
            items: { $ref: "#/components/schemas/B/properties/m" },
        });

        // The sibling is walked, not copied verbatim.
        expect(responseSchema(inlineNestedRefs(spec))).toEqual({
            type: "array",
            items: { type: "string" },
        });
    });

    it("resolves `~0`/`~1` escapes in a pointer segment per RFC 6901", () => {
        const spec = specWithResponseRef("#/components/schemas/A/properties/a~1b~0c", {
            A: { type: "object", properties: { "a/b~c": { type: "array", items: { type: "string" } } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(result.paths["/x"].get?.responses?.["200"]?.content?.["application/json"]?.schema).toEqual({
            type: "array",
            items: { type: "string" },
        });
        expect(warnings).toEqual([]);
    });

    it("ignores a non-string $ref instead of treating it as a pointer", () => {
        // A malformed spec can hold anything here; `typeof ref === "string"` is
        // what keeps the walk from calling String methods on it.
        const spec = specWithResponseRef("#/components/schemas/A/properties/n", {
            A: { type: "object", properties: { n: { $ref: 42 } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: 42 });
        expect(warnings).toEqual([]);
    });

    it('leaves a pointer at a scalar in place and warns — `.../type` is the string "array"', () => {
        const ref = "#/components/schemas/PolicyEntry/properties/namespaces/type";
        const spec = specWithResponseRef(ref, policyEntrySchemas);
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        // Inlining the bare string would make it read as a *type name* downstream.
        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(ref);
        expect(warnings[0]).toContain("string");
    });

    it("leaves a pointer resolving to null in place — inlining it would emit Observable<any>", () => {
        const ref = "#/components/schemas/A/properties/n/example";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "array", example: null } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings[0]).toContain("null");
        expect(warnings[0]).toContain("not a schema");
    });

    it("leaves a pointer resolving to an array in place and names the kind", () => {
        // `.../enum` is an array of values, not a schema.
        const ref = "#/components/schemas/A/properties/status/enum";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { status: { type: "string", enum: ["on", "off"] } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings[0]).toContain("resolves to an array, not a schema");
    });

    it("names the class when a pointer resolves to a Date js-yaml produced", () => {
        // `example: 2020-01-01` unquoted is a Date, not a schema — and not a
        // plain object either, so `transform` could not rebuild it.
        const ref = "#/components/schemas/A/properties/n/example";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "string", example: new Date("2020-01-01") } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings[0]).toContain("resolves to a Date, not a schema");
    });

    it("falls back to a generic kind for an object with no named constructor", () => {
        // No parser produces this; `inlineNestedRefs` is exported, so a
        // programmatic caller can hand it one. Reading `.name` off the missing
        // constructor unguarded would throw here.
        const odd = Object.create(Object.create(null)) as object;
        const ref = "#/components/schemas/A/properties/n/example";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "string", example: odd } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings[0]).toContain("resolves to a non-plain object, not a schema");
    });

    it("inlines a target holding an array, keeping it an array in the copy", () => {
        const spec = specWithResponseRef("#/components/schemas/A/properties/status", {
            A: { type: "object", properties: { status: { type: "string", enum: ["on", "off"] } } },
        });

        expect(responseSchema(inlineNestedRefs(spec))).toEqual({ type: "string", enum: ["on", "off"] });
    });

    it("inlines a boolean target — `true`/`false` are legal schemas in OpenAPI 3.1", () => {
        const ref = "#/components/schemas/A/properties/anything";
        const spec = specWithResponseRef(ref, { A: { type: "object", properties: { anything: true } } });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toBe(true);
        expect(warnings).toEqual([]);
    });

    it("warns when keys sit next to a $ref whose target is a boolean schema — nowhere to merge them", () => {
        const ref = "#/components/schemas/A/properties/anything";
        const spec = specWithResponseRef(ref, { A: { type: "object", properties: { anything: true } } });
        setResponseSchema(spec, { $ref: ref, description: "free-form" });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toBe(true);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("description");
        expect(warnings[0]).toContain("dropped");
    });

    it("ignores a $ref into another document, deep pointer or not", () => {
        const ref = "./common.yaml#/components/schemas/A/properties/n";
        const spec = specWithResponseRef(ref, policyEntrySchemas);
        const warnings: string[] = [];

        // Not "#/…": external refs are out of scope, and must not be warned about.
        expect(responseSchema(inlineNestedRefs(spec, (message) => warnings.push(message)))).toEqual({ $ref: ref });
        expect(warnings).toEqual([]);
    });

    it("ignores a deep pointer into a component kind other than schemas", () => {
        const ref = "#/components/parameters/Limit/schema";
        const spec = specWithResponseRef(ref, policyEntrySchemas);
        const warnings: string[] = [];

        // Only schema definitions get the last-segment-becomes-a-type-name
        // treatment downstream, so only they need inlining.
        expect(responseSchema(inlineNestedRefs(spec, (message) => warnings.push(message)))).toEqual({ $ref: ref });
        expect(warnings).toEqual([]);
    });

    it("keeps a schema literally named `__proto__` as an own key instead of hijacking the prototype", () => {
        // JSON.parse produces "__proto__" as a real own, enumerable key, so a
        // spec can carry one; `result[key] = next` would invoke the inherited
        // setter, dropping the key and re-prototyping the rebuilt node.
        // Built from JSON text, not an object literal: `__proto__:` in a
        // literal sets the prototype, while JSON.parse makes it an own key.
        const spec = JSON.parse(`{
            "openapi": "3.0.0",
            "info": { "title": "t", "version": "1" },
            "paths": {
                "/x": { "get": { "responses": { "200": {
                    "description": "ok",
                    "content": { "application/json": {
                        "schema": { "$ref": "#/components/schemas/A/properties/n" }
                    } }
                } } } }
            },
            "components": { "schemas": {
                "__proto__": { "type": "object" },
                "A": { "type": "object", "properties": { "n": { "type": "array", "items": { "type": "string" } } } },
                "B": { "type": "object", "properties": {
                    "q": { "$ref": "#/components/schemas/A/properties/n" }
                } }
            } }
        }`) as SwaggerSpec;
        // Guard the premise: the parsed input really has the own key.
        expect(Object.keys(spec.components?.schemas ?? {})).toContain("__proto__");

        const result = inlineNestedRefs(spec);
        const schemas = result.components?.schemas as Record<string, unknown>;

        expect(responseSchema(result)).toEqual({ type: "array", items: { type: "string" } });
        // `B` holds a deep ref, so the schemas map itself is rebuilt — the case
        // where a `__proto__` sibling would be lost.
        expect((schemas["B"] as { properties: Record<string, unknown> }).properties["q"]).toEqual({
            type: "array",
            items: { type: "string" },
        });
        // Survives the rebuild of the branch that changed, as an own data key…
        expect(Object.keys(schemas)).toContain("__proto__");
        expect(Object.prototype.hasOwnProperty.call(schemas, "__proto__")).toBe(true);
        // …and the rebuilt node keeps a plain prototype.
        expect(Object.getPrototypeOf(schemas)).toBe(Object.prototype);
    });

    it("bounds an acyclic fan-out chain instead of expanding it combinatorially", () => {
        // Each level references the previous one twice: N levels would expand
        // 2^N nodes. The cycle guard never fires — no pointer re-enters itself.
        const levels = 40;
        const schemas: Record<string, unknown> = { S0: { properties: { p: { type: "string" } } } };
        for (let index = 1; index <= levels; index++) {
            const previous = `#/components/schemas/S${index - 1}/properties/p`;
            schemas[`S${index}`] = { properties: { p: { a: { $ref: previous }, b: { $ref: previous } } } };
        }
        const spec = specWithResponseRef(`#/components/schemas/S${levels}/properties/p`, schemas);
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        // Unbounded, this is ~30 MB and ~18 s at N=20 alone.
        expect(JSON.stringify(result).length).toBeLessThan(20_000_000);
        expect(warnings.some((message) => message.includes("budget"))).toBe(true);
        expect(warnings.some((message) => message.includes("cyclic"))).toBe(false);
    }, 20_000);

    it("stops a chain deeper than the pointer-hop limit and warns", () => {
        // A linear chain: no fan-out, so the node budget never fires — the
        // depth cap is what keeps recursion (and the stack) bounded.
        const levels = 200;
        const schemas: Record<string, unknown> = { S0: { type: "string" } };
        for (let index = 1; index <= levels; index++) {
            schemas[`S${index}`] = { properties: { p: { $ref: `#/components/schemas/S${index - 1}/properties/p` } } };
        }
        schemas["S1"] = { properties: { p: { type: "string" } } };
        const spec = specWithResponseRef(`#/components/schemas/S${levels}/properties/p`, schemas);
        const warnings: string[] = [];

        inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(warnings.some((message) => message.includes("hops deep"))).toBe(true);
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
