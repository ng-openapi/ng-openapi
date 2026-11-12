import { describe, expect, it } from "vitest";
import { normalizeSchema, normalizeSpec, SwaggerSpec } from "../src";

const spec = {
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
        "/orders/{orderId}": {
            get: {
                operationId: "getOrder",
                parameters: [
                    { name: "orderId", in: "path", required: true, schema: { type: "string" } },
                    { name: "verbose", in: "query", schema: { type: "boolean" } },
                    { name: "X-Trace", in: "header", schema: { type: "string" } },
                ],
                responses: {
                    "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } },
                },
            },
        },
        "/files": {
            post: {
                operationId: "upload",
                requestBody: {
                    content: {
                        "multipart/form-data": { schema: { $ref: "#/components/schemas/UploadForm" } },
                    },
                },
                responses: { "201": { description: "created" } },
            },
        },
        "/token": {
            post: {
                operationId: "token",
                requestBody: {
                    content: {
                        "application/x-www-form-urlencoded": {
                            schema: { type: "object", properties: { user: { type: "string" } } },
                        },
                    },
                },
                responses: { "200": { description: "ok", content: { "application/pdf": {} } } },
            },
        },
    },
    components: {
        schemas: {
            UploadForm: {
                type: "object",
                properties: { file: { type: "string", format: "binary" }, note: { type: "string" } },
            },
        },
    },
} as unknown as SwaggerSpec;

describe("normalizeSpec", () => {
    const normalized = normalizeSpec(spec);

    it("extracts version info", () => {
        expect(normalized.version).toEqual({ type: "openapi", version: "3.0.3" });
        expect(normalizeSpec({ swagger: "2.0", paths: {} } as never).version).toEqual({
            type: "swagger",
            version: "2.0",
        });
        expect(normalizeSpec({ paths: {} } as never).version).toBeNull();
    });

    it("carries the spec's info block through, and leaves it undefined when absent", () => {
        expect(normalized.info).toEqual({ title: "t", version: "1", description: undefined });
        expect(normalizeSpec({ openapi: "3.0.0", paths: {} } as never).info).toBeUndefined();
    });

    it("coerces info fields silently: nothing reads them unless the package option is set", () => {
        // `version: 1.0` is the number 1 after js-yaml — a very common spec;
        // warning here would nag every YAML user on every run, so the
        // scaffold warns at the point of use instead
        const warnings: string[] = [];
        const onWarning = (message: string) => warnings.push(message);
        expect(
            normalizeSpec({ openapi: "3.0.0", info: { title: "t", version: 1 }, paths: {} } as never, onWarning).info,
        ).toEqual({ title: "t", version: "1", description: undefined });
        expect(
            normalizeSpec(
                {
                    openapi: "3.0.0",
                    info: { title: { en: "Pets" }, version: "1", description: ["a"] },
                    paths: {},
                } as never,
                onWarning,
            ).info,
        ).toEqual({ title: undefined, version: "1", description: undefined });
        expect(warnings).toEqual([]);
    });

    it("unifies definitions across spec versions", () => {
        expect(Object.keys(normalized.definitions)).toEqual(["UploadForm"]);
        const v2 = normalizeSpec({ swagger: "2.0", definitions: { Pet: { type: "object" } }, paths: {} } as never);
        expect(Object.keys(v2.definitions)).toEqual(["Pet"]);
    });

    it("resolves both $ref styles", () => {
        expect(normalized.resolveReference("#/components/schemas/UploadForm")).toBeDefined();
        expect(normalized.resolveReference("#/definitions/UploadForm")).toBeDefined();
        expect(normalized.resolveReference("#/components/schemas/Nope")).toBeUndefined();
    });

    it("does not resolve a schema ref to an inherited property", () => {
        expect(normalized.resolveReference("#/components/schemas/constructor")).toBeUndefined();
        expect(normalized.resolveReference("#/components/schemas/__proto__")).toBeUndefined();
    });

    it("splits parameters by location", () => {
        const op = normalized.operations.find((o) => o.operationId === "getOrder")!;
        expect(op.pathParams.map((p) => p.name)).toEqual(["orderId"]);
        expect(op.queryParams.map((p) => p.name)).toEqual(["verbose"]);
    });

    it("precomputes multipart context with $ref resolution", () => {
        const op = normalized.operations.find((o) => o.operationId === "upload")!;
        expect(op.hasBody).toBe(true);
        expect(op.isMultipart).toBe(true);
        expect(op.isUrlEncoded).toBe(false);
        expect(op.formDataFields).toEqual(["file", "note"]);
        expect(op.formDataSchema?.properties?.["file"]).toMatchObject({ type: "string", format: "binary" });
        expect(op.urlEncodedFields).toEqual([]);
        expect(op.urlEncodedSchema).toBeUndefined();
    });

    it("precomputes urlencoded context from inline schemas", () => {
        const op = normalized.operations.find((o) => o.operationId === "token")!;
        expect(op.isUrlEncoded).toBe(true);
        expect(op.urlEncodedFields).toEqual(["user"]);
        expect(op.formDataFields).toEqual([]);
    });

    it("derives responseType from the first success response", () => {
        expect(normalized.operations.find((o) => o.operationId === "getOrder")!.responseType).toBe("json");
        expect(normalized.operations.find((o) => o.operationId === "token")!.responseType).toBe("arraybuffer");
        // 201 with no content → json default
        expect(normalized.operations.find((o) => o.operationId === "upload")!.responseType).toBe("json");
    });

    it("derives acceptHeader from the same success response", () => {
        expect(normalized.operations.find((o) => o.operationId === "getOrder")!.acceptHeader).toBe("application/json");
        expect(normalized.operations.find((o) => o.operationId === "token")!.acceptHeader).toBe("application/pdf");
        // 201 with no content → nothing to advertise
        expect(normalized.operations.find((o) => o.operationId === "upload")!.acceptHeader).toBeUndefined();
    });
});

describe("normalizeSpec: $ref request bodies and responses (#132)", () => {
    const refSpec = {
        openapi: "3.1.0",
        info: { title: "t", version: "1" },
        paths: {
            "/files": {
                post: {
                    operationId: "upload",
                    requestBody: { $ref: "#/components/requestBodies/Upload" },
                    responses: { "200": { $ref: "#/components/responses/File" } },
                },
            },
            "/notes": {
                get: {
                    operationId: "note",
                    responses: { "200": { $ref: "#/components/responses/Note~1Text" } },
                },
            },
        },
        components: {
            requestBodies: {
                Upload: {
                    content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/UploadForm" } } },
                },
            },
            responses: {
                File: { description: "f", content: { "application/pdf": {} } },
                "Note/Text": {
                    description: "n",
                    content: { "application/json": { schema: { type: ["string", "null"] } } },
                },
            },
            schemas: {
                UploadForm: { type: "object", properties: { file: { type: "string", format: "binary" } } },
            },
        },
    } as unknown as SwaggerSpec;
    const pristine = structuredClone(refSpec);
    const warnings: string[] = [];
    const normalized = normalizeSpec(refSpec, (message) => warnings.push(message));
    const op = (id: string) => normalized.operations.find((o) => o.operationId === id)!;

    it("resolves them without a warning", () => {
        expect(warnings).toEqual([]);
    });

    it("derives body facts from the referenced request body", () => {
        expect(op("upload").hasBody).toBe(true);
        expect(op("upload").isMultipart).toBe(true);
        expect(op("upload").formDataFields).toEqual(["file"]);
    });

    it("derives response facts from the referenced response", () => {
        expect(op("upload").responseType).toBe("arraybuffer");
        expect(op("upload").acceptHeader).toBe("application/pdf");
    });

    it("unescapes the pointer and normalizes 3.1 schemas inside the referenced response", () => {
        expect(op("note").responses?.["200"].content?.["application/json"].schema).toEqual({
            type: "string",
            nullable: true,
        });
    });

    it("never mutates the raw spec", () => {
        expect(refSpec).toEqual(pristine);
    });

    it("resolves Swagger 2.0 response refs against the top-level responses", () => {
        const v2 = normalizeSpec({
            swagger: "2.0",
            responses: { NotFound: { description: "not found" } },
            paths: { "/p": { get: { responses: { "404": { $ref: "#/responses/NotFound" } } } } },
        } as never);
        expect(v2.operations[0].responses?.["404"]).toEqual({ description: "not found" });
    });

    it("has nowhere to resolve a Swagger 2.0 request body ref from, and says so", () => {
        const v2Warnings: string[] = [];
        const v2 = normalizeSpec(
            {
                swagger: "2.0",
                paths: { "/p": { post: { requestBody: { $ref: "#/components/requestBodies/B" }, responses: {} } } },
            } as never,
            (message) => v2Warnings.push(message),
        );
        expect(v2.operations[0].hasBody).toBe(false);
        expect(v2Warnings.join("\n")).toContain(
            "which is not supported: Swagger 2.0 has no reusable request body components",
        );
    });
});

describe("normalizeSchema (OpenAPI 3.1 constructs)", () => {
    it("folds null members of type arrays into nullable", () => {
        expect(normalizeSchema({ type: ["string", "null"] as never })).toMatchObject({
            type: "string",
            nullable: true,
        });
    });

    it("keeps format working on nullable 3.1 schemas", () => {
        const normalized = normalizeSchema({
            type: ["string", "null"] as never,
            format: "date-time",
        });
        expect(normalized).toMatchObject({ type: "string", format: "date-time", nullable: true });
    });

    it("keeps multi-type arrays as unions and handles null-only types", () => {
        const multi = normalizeSchema({ type: ["string", "number", "null"] as never });
        expect(multi.type).toEqual(["string", "number"]);
        expect(multi.nullable).toBe(true);

        expect(normalizeSchema({ type: ["null"] as never }).type).toBe("null");
    });

    it("converts string/number const to a single-value enum", () => {
        expect(normalizeSchema({ type: "string", const: "active" })).toMatchObject({
            type: "string",
            enum: ["active"],
        });
        expect(normalizeSchema({ type: "string", const: "active" }).const).toBeUndefined();
        expect(normalizeSchema({ const: 7 })).toMatchObject({ type: "number", enum: [7] });
        // An existing enum wins over const
        expect(normalizeSchema({ const: "x", enum: ["a"] }).enum).toEqual(["a"]);
    });

    it("types boolean const as plain boolean instead of an enum", () => {
        const normalized = normalizeSchema({ const: true });
        expect(normalized.type).toBe("boolean");
        expect(normalized.enum).toBeUndefined();
        expect(normalized.const).toBeUndefined();
    });

    it("leaves non-primitive consts untouched", () => {
        const objectConst = normalizeSchema({ const: { kind: "a" } });
        expect(objectConst.enum).toBeUndefined();
        expect(objectConst.const).toEqual({ kind: "a" });

        const arrayConst = normalizeSchema({ const: [1, 2] });
        expect(arrayConst.enum).toBeUndefined();
        expect(arrayConst.const).toEqual([1, 2]);

        const nullConst = normalizeSchema({ const: null });
        expect(nullConst.enum).toBeUndefined();
        expect(nullConst.const).toBeNull();
    });

    it("recurses into properties, items, compositions and additionalProperties", () => {
        const normalized = normalizeSchema({
            type: "object",
            properties: {
                tag: { type: ["string", "null"] as never },
                list: { type: "array", items: { const: 1 } },
            },
            additionalProperties: { type: ["number", "null"] as never },
            oneOf: [{ const: "a" }],
        });
        expect(normalized.properties?.["tag"]).toMatchObject({ type: "string", nullable: true });
        expect((normalized.properties?.["list"].items as { enum: unknown[] }).enum).toEqual([1]);
        expect(normalized.additionalProperties).toMatchObject({ type: "number", nullable: true });
        expect(normalized.oneOf?.[0].enum).toEqual(["a"]);
    });

    it("leaves 2.0/3.0-style schemas semantically untouched and never mutates input", () => {
        const input = { type: "string", format: "date", enum: ["a"] } as const;
        const copy = JSON.parse(JSON.stringify(input));
        const normalized = normalizeSchema(input as never);
        expect(normalized).toEqual(copy);
        expect(input).toEqual(copy);

        const arrayInput = { type: ["string", "null"] as never };
        normalizeSchema(arrayInput);
        expect(arrayInput.type).toEqual(["string", "null"]);
    });
});

describe("normalizeSpec: enum member names (#31)", () => {
    const EXTENSIONS = ["x-enum-varnames", "x-enumNames"];

    type NamingOptions = { enumNameExtensions?: string[]; generateEnumBasedOnDescription?: boolean };

    /** Normalizes one schema named `Kind` and returns its resolved names plus any warnings. */
    function namesOf(
        schema: Record<string, unknown>,
        options: NamingOptions,
    ): { names: string[] | undefined; warnings: string[] } {
        const warnings: string[] = [];
        const normalized = normalizeSpec(
            { openapi: "3.0.3", paths: {}, components: { schemas: { Kind: schema } } } as never,
            (message) => warnings.push(message),
            { options },
        );
        return { names: normalized.definitions["Kind"].enumMemberNames, warnings };
    }
    const fromExtensions = (schema: Record<string, unknown>) => namesOf(schema, { enumNameExtensions: EXTENSIONS });

    it("resolves nothing unless a source is configured", () => {
        const schema = { type: "integer", enum: [0, 1], "x-enumNames": ["Unknown", "Full"] };
        expect(namesOf(schema, {})).toEqual({ names: undefined, warnings: [] });
        expect(
            normalizeSpec({ openapi: "3.0.3", paths: {}, components: { schemas: { Kind: schema } } } as never)
                .definitions["Kind"].enumMemberNames,
        ).toBeUndefined();
    });

    it("reads names from a configured extension, positionally", () => {
        expect(
            fromExtensions({ type: "integer", enum: [0, 1, 2], "x-enumNames": ["Unknown", "Full", "Delta"] }),
        ).toEqual({
            names: ["Unknown", "Full", "Delta"],
            warnings: [],
        });
    });

    it("honors the configured order when several extensions are present", () => {
        const schema = { enum: [0, 1], "x-enumNames": ["FromNSwag", "B"], "x-enum-varnames": ["FromOpenApiGen", "B"] };
        expect(fromExtensions(schema).names).toEqual(["FromOpenApiGen", "B"]);
        expect(namesOf(schema, { enumNameExtensions: ["x-enumNames", "x-enum-varnames"] }).names).toEqual([
            "FromNSwag",
            "B",
        ]);
    });

    it("keeps valid identifiers verbatim and sanitizes the rest", () => {
        expect(
            fromExtensions({
                enum: [1, 2, 3, 4],
                "x-enumNames": ["snake_case", "$dollar", "two words", "1st"],
            }).names,
        ).toEqual(["snake_case", "$dollar", "TwoWords", "_1st"]);
    });

    it("never emits __proto__, which would set the prototype of the union style's const object", () => {
        expect(fromExtensions({ enum: [1], "x-enumNames": ["__proto__"] }).names).toEqual(["_Proto__"]);
    });

    it("names a const the normalizer folded into a single-value enum", () => {
        expect(fromExtensions({ const: "only", "x-enumNames": ["Only"] }).names).toEqual(["Only"]);
    });

    it("warns about a malformed extension and falls through to the next source", () => {
        const { names, warnings } = fromExtensions({
            enum: [0, 1],
            "x-enum-varnames": ["OnlyOne"],
            "x-enumNames": ["Unknown", "Full"],
        });
        expect(names).toEqual(["Unknown", "Full"]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Enum "Kind"');
        expect(warnings[0]).toContain("x-enum-varnames");
    });

    it.each([
        ["not an array", "Unknown,Full"],
        ["non-string entries", ["Unknown", 1]],
        ["too many names", ["Unknown", "Full", "Extra"]],
    ])("rejects an extension that is %s", (_label, value) => {
        const { names, warnings } = fromExtensions({ enum: [0, 1], "x-enumNames": value });
        expect(names).toBeUndefined();
        expect(warnings).toHaveLength(1);
    });

    it("rejects names that collide, also after sanitizing", () => {
        const verbatim = fromExtensions({ enum: [0, 1], "x-enumNames": ["Same", "Same"] });
        expect(verbatim.names).toBeUndefined();
        expect(verbatim.warnings[0]).toContain('"Same"');

        const sanitized = fromExtensions({ enum: [0, 1], "x-enumNames": ["two words", "two-words"] });
        expect(sanitized.names).toBeUndefined();
        expect(sanitized.warnings[0]).toContain('"TwoWords"');
    });

    it("never trusts an enumMemberNames key authored in the spec", () => {
        expect(fromExtensions({ enum: [0, 1], enumMemberNames: ["evil key", "x"] }).names).toBeUndefined();
        expect(
            fromExtensions({ enum: [0, 1], enumMemberNames: ["evil key", "x"], "x-enumNames": ["Unknown", "Full"] })
                .names,
        ).toEqual(["Unknown", "Full"]);
    });

    it("leaves non-enum and nested schemas alone", () => {
        const normalized = normalizeSpec(
            {
                openapi: "3.0.3",
                paths: {},
                components: {
                    schemas: {
                        Holder: {
                            type: "object",
                            "x-enumNames": ["A"],
                            properties: { kind: { enum: [0], "x-enumNames": ["Unknown"] } },
                        },
                    },
                },
            } as never,
            undefined,
            { options: { enumNameExtensions: EXTENSIONS } },
        );
        expect(normalized.definitions["Holder"].enumMemberNames).toBeUndefined();
        expect(normalized.definitions["Holder"].properties?.["kind"].enumMemberNames).toBeUndefined();
    });

    describe("generateEnumBasedOnDescription", () => {
        const fromDescription = (schema: Record<string, unknown>) =>
            namesOf(schema, { generateEnumBasedOnDescription: true });

        it("matches names to enum values by Value, whatever the order", () => {
            expect(
                fromDescription({
                    enum: [1, 2],
                    description: '[{"Name":"Second","Value":2},{"Name":"First","Value":1}]',
                }),
            ).toEqual({ names: ["First", "Second"], warnings: [] });
        });

        it("names string enums", () => {
            expect(
                fromDescription({
                    enum: ["a", "b"],
                    description: '[{"Name":"Alpha","Value":"a"},{"Name":"Beta","Value":"b"}]',
                }).names,
            ).toEqual(["Alpha", "Beta"]);
        });

        it("ignores entries for values the enum does not have: enum is the source of truth", () => {
            expect(
                fromDescription({
                    enum: [1],
                    description: '[{"Name":"First","Value":1},{"Name":"Gone","Value":9}]',
                }).names,
            ).toEqual(["First"]);
        });

        it("sanitizes names instead of emitting them verbatim", () => {
            // Same sanitizer as value-derived names: "in progress" as a value yields this key too
            expect(fromDescription({ enum: [1], description: '[{"Name":"in progress","Value":1}]' }).names).toEqual([
                "InProgress",
            ]);
        });

        it("rejects a repeated enum value, which would give two members one name", () => {
            const { names, warnings } = fromDescription({ enum: [1, 1], description: '[{"Name":"First","Value":1}]' });
            expect(names).toBeUndefined();
            expect(warnings[0]).toContain('"First"');
        });

        it("stays quiet on prose descriptions", () => {
            expect(fromDescription({ enum: [1, 2], description: "Plain human-readable description" })).toEqual({
                names: undefined,
                warnings: [],
            });
            expect(fromDescription({ enum: [1, 2] })).toEqual({ names: undefined, warnings: [] });
        });

        it.each([
            ["malformed JSON", '[{"Name":"First","Value":1},]'],
            ["an object instead of an array", '{"Name":"First","Value":1}'],
            ["entries of the wrong shape", '[{"name":"First","value":1},{"name":"Second","value":2}]'],
            ["an enum value without a name", '[{"Name":"First","Value":1}]'],
            ["a Value of the wrong type", '[{"Name":"First","Value":"1"},{"Name":"Second","Value":"2"}]'],
        ])("warns and falls back on %s", (_label, description) => {
            const { names, warnings } = fromDescription({ enum: [1, 2], description });
            expect(names).toBeUndefined();
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain('Enum "Kind"');
            expect(warnings[0]).toContain("generateEnumBasedOnDescription");
        });

        it("ranks below a configured extension", () => {
            const described = {
                enum: [1, 2],
                description: '[{"Name":"FromDescription","Value":1},{"Name":"B","Value":2}]',
            };
            const options = { enumNameExtensions: EXTENSIONS, generateEnumBasedOnDescription: true };
            expect(namesOf({ ...described, "x-enumNames": ["FromExtension", "B"] }, options).names).toEqual([
                "FromExtension",
                "B",
            ]);
            expect(namesOf(described, options)).toEqual({ names: ["FromDescription", "B"], warnings: [] });
        });
    });
});
