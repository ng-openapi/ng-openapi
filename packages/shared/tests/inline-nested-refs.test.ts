import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
// `inlineNestedRefs` is package-internal (see src/index.ts) — imported from the
// core barrel, not the public one.
import { inlineNestedRefs } from "../src/core";
import type { SwaggerSpec } from "../src";

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
        const warnings: string[] = [];

        expect(responseSchema(inlineNestedRefs(spec, (message) => warnings.push(message)))).toEqual({
            type: "array",
            items: { type: "string" },
            // Local annotation wins over the target's own description.
            description: "Only the namespaces this token may touch.",
            nullable: true,
        });
        // `description` *does* collide with the target's, but overriding a ref'd
        // property's description is the ordinary authoring shape and changes no
        // emitted type — warning here would be noise on every such spec.
        expect(warnings).toEqual([]);
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

    it("names a non-string $ref instead of silently ignoring it", () => {
        // A malformed spec can hold anything here; `typeof ref === "string"` is
        // what keeps the walk from calling String methods on it. Downstream is
        // not so careful — `getTypeScriptType` does `schema.$ref.split("/")`
        // and throws a bare TypeError outside the typed-error contract — so the
        // value must at least be reported here.
        const spec = specWithResponseRef("#/components/schemas/A/properties/n", {
            A: { type: "object", properties: { n: { $ref: 42 } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        // Left untouched — destroying it would lose information.
        expect(responseSchema(result)).toEqual({ $ref: 42 });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("a number");
        expect(warnings[0]).toContain("42");
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

    it("refuses a pointer at a `properties` map — a plain object, but not a schema", () => {
        // The value guard passes it (it *is* a plain object); only the position
        // check catches it. Inlined it would emit `any` with no diagnostic,
        // where the untouched ref at least emits a dangling `Properties`.
        const ref = "#/components/schemas/PolicyEntry/properties";
        const spec = specWithResponseRef(ref, policyEntrySchemas);
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(ref);
        expect(warnings[0]).toContain("does not address a schema");
        expect(warnings[0]).toContain('"properties" segment');
    });

    it("refuses a pointer at other non-schema plain objects under a schema", () => {
        const spec = specWithResponseRef("#/components/schemas/A/externalDocs", {
            A: {
                type: "object",
                externalDocs: { url: "https://example.test" },
                discriminator: { propertyName: "kind", mapping: { a: "#/components/schemas/A" } },
                properties: { n: { type: "string", example: { nested: "object" } } },
            },
        });
        const refs = [
            "#/components/schemas/A/externalDocs",
            "#/components/schemas/A/discriminator/mapping",
            "#/components/schemas/A/properties/n/example",
        ];

        for (const ref of refs) {
            setResponseSchema(spec, { $ref: ref });
            const warnings: string[] = [];

            const result = inlineNestedRefs(spec, (message) => warnings.push(message));

            expect(responseSchema(result)).toEqual({ $ref: ref });
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain("does not address a schema");
        }
    });

    it("refuses a pointer ending on a composition list rather than one of its members", () => {
        const ref = "#/components/schemas/Envelope/allOf";
        const spec = specWithResponseRef(ref, composedSchemas);
        const warnings: string[] = [];

        // Resolves to an array, so the value guard already refuses it — but the
        // message must still be about a schema, not about the kind alone.
        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings[0]).toContain("not a schema");
    });

    it("inlines every schema-valued position a pointer can end on", () => {
        const schemas = {
            A: {
                type: "object",
                properties: { n: { type: "array", items: { type: "string" } } },
                additionalProperties: { type: "number" },
                not: { type: "boolean" },
                allOf: [{ type: "integer" }],
                $defs: { Inner: { type: "string", format: "uuid" } },
            },
        } as const;
        const cases: [string, unknown][] = [
            ["#/components/schemas/A/properties/n", { type: "array", items: { type: "string" } }],
            ["#/components/schemas/A/properties/n/items", { type: "string" }],
            ["#/components/schemas/A/additionalProperties", { type: "number" }],
            ["#/components/schemas/A/not", { type: "boolean" }],
            ["#/components/schemas/A/allOf/0", { type: "integer" }],
            ["#/components/schemas/A/$defs/Inner", { type: "string", format: "uuid" }],
        ];

        for (const [ref, expected] of cases) {
            const spec = specWithResponseRef(ref, schemas);
            const warnings: string[] = [];

            const result = inlineNestedRefs(spec, (message) => warnings.push(message));

            expect(responseSchema(result)).toEqual(expected);
            expect(warnings).toEqual([]);
        }
    });

    it("treats the segment after `properties` as a name, even when it reads like a keyword", () => {
        const ref = "#/components/schemas/A/properties/items";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { items: { type: "array", items: { type: "string" } } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ type: "array", items: { type: "string" } });
        expect(warnings).toEqual([]);
    });

    it("warns when a sibling overrides a type-bearing key of the target, naming it and the winner", () => {
        // The one case where the 3.0-vs-2020-12 sibling reading changes the
        // emitted TypeScript: `string` for a field the API returns as `string[]`.
        const ref = "#/components/schemas/PolicyEntry/properties/namespaces";
        const spec = specWithResponseRef(ref, policyEntrySchemas);
        setResponseSchema(spec, { $ref: ref, type: "string" });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({
            type: "string",
            description: "Namespace patterns this policy entry applies to.",
            items: { type: "string" },
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(ref);
        expect(warnings[0]).toContain("(type)");
        expect(warnings[0]).toContain("the local value won");
    });

    it("stays silent for siblings that only add keys the target does not define", () => {
        const ref = "#/components/schemas/A/properties/n";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "array", items: { type: "string" } } } },
        });
        setResponseSchema(spec, { $ref: ref, description: "free-form", nullable: true });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({
            type: "array",
            items: { type: "string" },
            description: "free-form",
            nullable: true,
        });
        expect(warnings).toEqual([]);
    });

    it("stays silent when a sibling overrides an annotation-only key of the target", () => {
        // Nothing downstream reads these for a type, so the 3.0-vs-2020-12
        // choice cannot change one character of the emitted TypeScript — and
        // re-describing a ref'd property is the ordinary authoring shape.
        const ref = "#/components/schemas/A/properties/n";
        const spec = specWithResponseRef(ref, {
            A: {
                type: "object",
                properties: {
                    n: {
                        type: "array",
                        items: { type: "string" },
                        description: "target's",
                        title: "Target",
                        example: ["a"],
                        deprecated: false,
                    },
                },
            },
        });
        setResponseSchema(spec, {
            $ref: ref,
            description: "the site's",
            title: "Site",
            example: ["b"],
            deprecated: true,
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({
            type: "array",
            items: { type: "string" },
            description: "the site's",
            title: "Site",
            example: ["b"],
            deprecated: true,
        });
        expect(warnings).toEqual([]);
    });

    it("stays silent when a sibling only restates the value the target already has", () => {
        // Same key, same value: whichever reading wins, the output is identical,
        // so there is nothing for the user to act on.
        const ref = "#/components/schemas/A/properties/n";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "array", items: { type: "string" } } } },
        });
        setResponseSchema(spec, { $ref: ref, type: "array", items: { type: "string" } });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ type: "array", items: { type: "string" } });
        expect(warnings).toEqual([]);
    });

    it("names only the type-bearing key when a sibling overrides that and an annotation together", () => {
        const ref = "#/components/schemas/A/properties/n";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "array", items: { type: "string" }, description: "t" } } },
        });
        setResponseSchema(spec, { $ref: ref, type: "string", description: "s" });
        const warnings: string[] = [];

        inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("(type)");
        expect(warnings[0]).not.toContain("description)");
    });

    it("names every ref left uninlined once the expansion budget is gone", () => {
        // Two independent deep refs after a fan-out bomb: a run-global warning
        // key would name only the first, leaving the rest as dangling refs the
        // user never hears about (generated files ship @ts-nocheck).
        const levels = 40;
        const schemas: Record<string, unknown> = {
            S0: { properties: { p: { type: "string" } } },
            Small1: { properties: { p: { type: "string" } } },
            Small2: { properties: { p: { type: "integer" } } },
        };
        for (let index = 1; index <= levels; index++) {
            const previous = `#/components/schemas/S${index - 1}/properties/p`;
            schemas[`S${index}`] = { properties: { p: { a: { $ref: previous }, b: { $ref: previous } } } };
        }
        const small1 = "#/components/schemas/Small1/properties/p";
        const small2 = "#/components/schemas/Small2/properties/p";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                // Insertion order is the walk order: the bomb exhausts the
                // budget, then the two small refs are met.
                "/bomb": {
                    get: {
                        responses: {
                            "200": {
                                description: "ok",
                                schema: { $ref: `#/components/schemas/S${levels}/properties/p` },
                            },
                        },
                    },
                },
                "/small1": { get: { responses: { "200": { description: "ok", schema: { $ref: small1 } } } } },
                "/small2": { get: { responses: { "200": { description: "ok", schema: { $ref: small2 } } } } },
            },
            components: { schemas },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));
        const schemaAt = (path: string): unknown => result.paths[path].get?.responses?.["200"]?.schema;

        // Exhaustion is terminal, so both small refs are left alone — which of
        // them fits in the remainder must not depend on the spec's key order.
        expect(schemaAt("/small1")).toEqual({ $ref: small1 });
        expect(schemaAt("/small2")).toEqual({ $ref: small2 });
        // …and each is named, not silently dropped behind the first warning.
        expect(warnings.some((message) => message.includes(small1))).toBe(true);
        expect(warnings.some((message) => message.includes(small2))).toBe(true);
    }, 20_000);

    it("warns per colliding key set, not per ref — which siblings collide belongs to the site", () => {
        // Deduping sibling findings by ref alone lets the first site consume the
        // bucket: a second site overriding a *different* type-bearing key then
        // drops the target's value with no warning at all — the exact failure
        // the warning exists to prevent, surviving inside the fix for it.
        const ref = "#/components/schemas/A/properties/n";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                "/a": { get: { responses: { "200": { description: "ok", schema: { $ref: ref, type: "string" } } } } },
                "/b": {
                    get: {
                        responses: {
                            "200": {
                                description: "ok",
                                schema: { $ref: ref, items: { type: "number" }, format: "uuid" },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: { A: { type: "object", properties: { n: { type: "array", items: { type: "string" } } } } },
            },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));
        const schemaAt = (path: string): unknown => result.paths[path].get?.responses?.["200"]?.schema;

        expect(schemaAt("/b")).toEqual({ type: "array", items: { type: "number" }, format: "uuid" });
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain("(type)");
        expect(warnings[1]).toContain("(items)");
        // A third site repeating the *same* key set is still one finding.
        const repeated: string[] = [];
        inlineNestedRefs(
            {
                ...spec,
                paths: {
                    ...spec.paths,
                    "/c": {
                        get: { responses: { "200": { description: "ok", schema: { $ref: ref, type: "string" } } } },
                    },
                },
            } as unknown as SwaggerSpec,
            (message) => repeated.push(message),
        );
        expect(repeated).toHaveLength(2);
    });

    it("warns per dropped key set when a boolean target is used at more than one site", () => {
        const ref = "#/components/schemas/A/properties/anything";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                "/a": {
                    get: { responses: { "200": { description: "ok", schema: { $ref: ref, description: "d" } } } },
                },
                "/b": { get: { responses: { "200": { description: "ok", schema: { $ref: ref, title: "t" } } } } },
            },
            components: { schemas: { A: { type: "object", properties: { anything: true } } } },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain("description");
        expect(warnings[1]).toContain("title");
    });

    it("keeps walking the siblings of a refused $ref instead of swallowing the subtree", () => {
        // Every refusal used to `return node`, so nothing under it was visited:
        // one typo'd deep ref hid every deep ref beneath it — uninlined *and*
        // unwarned, i.e. invisible under `@ts-nocheck`.
        const outer = "#/components/schemas/Missing/properties/nope";
        const inner = "#/components/schemas/AlsoMissing/properties/gone";
        const spec = specWithResponseRef(outer, {});
        setResponseSchema(spec, { $ref: outer, additionalProperties: { $ref: inner } });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: outer, additionalProperties: { $ref: inner } });
        expect(warnings).toHaveLength(2);
        expect(warnings.some((message) => message.includes(outer))).toBe(true);
        expect(warnings.some((message) => message.includes(inner))).toBe(true);
    });

    it("still inlines a resolvable deep $ref nested under a refused one", () => {
        const broken = "#/components/schemas/A/externalDocs";
        const good = "#/components/schemas/A/properties/n";
        const spec = specWithResponseRef(broken, {
            A: {
                type: "object",
                externalDocs: { url: "https://example.test" },
                properties: { n: { type: "array", items: { type: "string" } } },
            },
        });
        setResponseSchema(spec, { $ref: broken, additionalProperties: { $ref: good } });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({
            $ref: broken,
            additionalProperties: { type: "array", items: { type: "string" } },
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(broken);
    });

    it("walks the siblings of a cyclic $ref too", () => {
        const cyclic = "#/components/schemas/Loop/properties/wrapper";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {},
            components: {
                schemas: {
                    Loop: {
                        type: "object",
                        properties: {
                            wrapper: {
                                type: "array",
                                // The cyclic ref carries a sibling holding a
                                // perfectly resolvable deep ref.
                                items: {
                                    $ref: cyclic,
                                    additionalProperties: { $ref: "#/components/schemas/B/properties/m" },
                                },
                            },
                        },
                    },
                    B: { type: "object", properties: { m: { type: "string" } } },
                },
            },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));
        const wrapper = (result.components?.schemas?.["Loop"]?.properties as Record<string, { items: unknown }>)[
            "wrapper"
        ];

        expect(wrapper.items).toEqual({
            // The outer hop inlined (nothing on the chain yet), and its own
            // sibling came along…
            type: "array",
            additionalProperties: { type: "string" },
            // …while the inner hop is the cyclic one: refused, left in place,
            // and its sibling still walked rather than swallowed with it.
            items: { $ref: cyclic, additionalProperties: { type: "string" } },
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("cyclic");
    });

    it("caps warnings per cause and names every held-back ref in one tail", () => {
        // One exhausted budget can leave hundreds of refs behind, each message
        // repeating the ~130-char suffix. The cap bounds the line count; the
        // tail keeps the guarantee that every left-behind ref is named.
        const total = 15;
        const paths: Record<string, unknown> = {};
        for (let index = 0; index < total; index++) {
            paths[`/p${index}`] = {
                get: {
                    responses: {
                        "200": {
                            description: "ok",
                            schema: { $ref: `#/components/schemas/Missing${index}/properties/nope` },
                        },
                    },
                },
            };
        }
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths,
            components: { schemas: {} },
        } as unknown as SwaggerSpec;
        const warnings: string[] = [];

        inlineNestedRefs(spec, (message) => warnings.push(message));

        // Ten in full, then exactly one tail.
        expect(warnings).toHaveLength(11);
        const tail = warnings[10];
        expect(tail).toContain("…and 5 more");
        // Held back, but still named — that is the whole point of the tail.
        for (let index = 10; index < total; index++) {
            expect(tail).toContain(`#/components/schemas/Missing${index}/properties/nope`);
        }
        // …and the tail does not repeat the long suffix once per ref.
        expect(tail).not.toContain("@ts-nocheck");
    });

    it("leaves $ref-shaped payload data alone instead of rewriting it as a schema", () => {
        // `example`/`default` hold the user's data, not schemas: a field named
        // `$ref` in a sample body is not a reference. Rewriting it destroys the
        // example (which the zod plugin ships into generated code for
        // `default`), invents a warning about a ref nobody wrote, and charges
        // the payload against the expansion budget.
        const spec = specWithResponseRef("#/components/schemas/A/properties/n", {
            A: {
                type: "object",
                properties: {
                    n: {
                        type: "array",
                        items: { type: "string" },
                        example: { $ref: "#/components/schemas/A/properties/n" },
                        default: { $ref: "#/components/schemas/Missing/properties/gone" },
                    },
                },
            },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({
            type: "array",
            items: { type: "string" },
            example: { $ref: "#/components/schemas/A/properties/n" },
            default: { $ref: "#/components/schemas/Missing/properties/gone" },
        });
        // No phantom warning about the unresolvable ref inside the payload.
        expect(warnings).toEqual([]);
    });

    it("leaves a $ref-shaped payload sitting next to a deep $ref alone", () => {
        const ref = "#/components/schemas/A/properties/n";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "array", items: { type: "string" } } } },
        });
        setResponseSchema(spec, { $ref: ref, example: { $ref: "#/components/schemas/Missing/properties/gone" } });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({
            type: "array",
            items: { type: "string" },
            example: { $ref: "#/components/schemas/Missing/properties/gone" },
        });
        expect(warnings).toEqual([]);
    });

    it("still inlines under a property literally named `example` or `default`", () => {
        // The payload skip is positional: inside a `properties` map the key is
        // a field name, not the `example` keyword.
        const spec = specWithResponseRef("#/components/schemas/Wrapper/properties/example", {
            Wrapper: {
                type: "object",
                properties: {
                    example: { $ref: "#/components/schemas/A/properties/n" },
                    default: { $ref: "#/components/schemas/A/properties/n" },
                },
            },
            A: { type: "object", properties: { n: { type: "array", items: { type: "string" } } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));
        const wrapper = result.components?.schemas?.["Wrapper"]?.properties as Record<string, unknown>;

        expect(wrapper["example"]).toEqual({ type: "array", items: { type: "string" } });
        expect(wrapper["default"]).toEqual({ type: "array", items: { type: "string" } });
        expect(warnings).toEqual([]);
    });

    it("still inlines inside the `default` entry of a responses map", () => {
        // `responses: { default: … }` is a status-code map, not a payload key.
        const ref = "#/components/schemas/A/properties/n";
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {
                "/x": {
                    get: {
                        responses: {
                            default: {
                                description: "error",
                                content: { "application/json": { schema: { $ref: ref } } },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: { A: { type: "object", properties: { n: { type: "array", items: { type: "string" } } } } },
            },
        } as unknown as SwaggerSpec;

        const result = inlineNestedRefs(spec);
        const schema = (
            result.paths["/x"].get?.responses as Record<
                string,
                { content: Record<string, { schema: unknown }> } | undefined
            >
        )["default"]?.content["application/json"].schema;

        expect(schema).toEqual({ type: "array", items: { type: "string" } });
    });

    it("does not resolve a pointer segment that only exists on the prototype", () => {
        // The discriminating input for the own-property check: every segment
        // before `toString` is a real own key, so `segment in current` would
        // resolve this to `Object.prototype.toString` — a function, which the
        // schema guard then reports as the wrong problem ("resolves to a
        // function") instead of the real one.
        const ref = "#/components/schemas/A/properties/toString";
        const spec = specWithResponseRef(ref, {
            A: { type: "object", properties: { n: { type: "string" } } },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ $ref: ref });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("Could not resolve");
        expect(warnings[0]).not.toContain("function");
    });

    it("returns an unchanged array by reference, not as a rebuilt copy", () => {
        // `transform`'s array branch has its own identity return; without it,
        // every spec carrying `required`/`allOf` would be rebuilt wholesale and
        // the copy-on-write guarantee would hold for objects only.
        const spec = {
            openapi: "3.0.0",
            info: { title: "t", version: "1" },
            paths: {},
            components: {
                schemas: {
                    ...policyEntrySchemas,
                    // Forces the schemas map itself to be rebuilt, so `Plain`
                    // coming back by identity is a real result, not the
                    // whole-spec passthrough.
                    Consumer: {
                        type: "object",
                        properties: { n: { $ref: "#/components/schemas/PolicyEntry/properties/namespaces" } },
                    },
                    Plain: {
                        type: "object",
                        required: ["id"],
                        allOf: [{ type: "object", properties: { id: { type: "string" } } }],
                        properties: { id: { type: "string" } },
                    },
                },
            },
        } as unknown as SwaggerSpec;
        const plain = spec.components?.schemas?.["Plain"] as Record<string, unknown>;

        const result = inlineNestedRefs(spec);
        const resultPlain = result.components?.schemas?.["Plain"] as Record<string, unknown>;

        // The schemas map is rebuilt (Consumer's branch changed)…
        expect(result.components?.schemas).not.toBe(spec.components?.schemas);
        // …while arrays with nothing to rewrite under them are the same arrays,
        // which is what keeps `Plain` itself unrebuilt.
        expect(resultPlain["required"]).toBe(plain["required"]);
        expect(resultPlain["allOf"]).toBe(plain["allOf"]);
        expect(resultPlain).toBe(plain);
    });

    it("unescapes `~01` to a literal `~1`, not to `/` — RFC 6901 escape ordering", () => {
        // The discriminating input: `a~1b~0c` passes under either order, `~01`
        // only under `~1` → `/` first, then `~0` → `~`.
        const spec = specWithResponseRef("#/components/schemas/A/properties/~01", {
            A: {
                type: "object",
                properties: { "~1": { type: "array", items: { type: "string" } }, "/": { type: "number" } },
            },
        });
        const warnings: string[] = [];

        const result = inlineNestedRefs(spec, (message) => warnings.push(message));

        expect(responseSchema(result)).toEqual({ type: "array", items: { type: "string" } });
        expect(warnings).toEqual([]);
    });
});
