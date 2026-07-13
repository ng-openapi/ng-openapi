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
        "/documents": {
            post: {
                operationId: "uploadDocument",
                requestBody: {
                    content: {
                        "multipart/form-data": {
                            schema: {
                                allOf: [
                                    { $ref: "#/components/schemas/UploadForm" },
                                    {
                                        type: "object",
                                        required: ["category"],
                                        properties: { category: { type: "string" } },
                                    },
                                ],
                            },
                        },
                    },
                },
                responses: { "201": { description: "created" } },
            },
        },
        "/documents/composed": {
            post: {
                operationId: "uploadComposedDocument",
                requestBody: {
                    content: {
                        "multipart/form-data": { schema: { $ref: "#/components/schemas/ComposedUploadForm" } },
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
                required: ["file"],
                properties: { file: { type: "string", format: "binary" }, note: { type: "string" } },
            },
            ComposedUploadForm: {
                allOf: [
                    { $ref: "#/components/schemas/UploadForm" },
                    { type: "object", properties: { tags: { type: "array", items: { type: "string" } } } },
                ],
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

    it("unifies definitions across spec versions", () => {
        expect(Object.keys(normalized.definitions)).toEqual(["UploadForm", "ComposedUploadForm"]);
        const v2 = normalizeSpec({ swagger: "2.0", definitions: { Pet: { type: "object" } }, paths: {} } as never);
        expect(Object.keys(v2.definitions)).toEqual(["Pet"]);
    });

    it("resolves both $ref styles", () => {
        expect(normalized.resolveReference("#/components/schemas/UploadForm")).toBeDefined();
        expect(normalized.resolveReference("#/definitions/UploadForm")).toBeDefined();
        expect(normalized.resolveReference("#/components/schemas/Nope")).toBeUndefined();
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
        expect(op.formDataSchema?.properties?.file).toMatchObject({ type: "string", format: "binary" });
        expect(op.urlEncodedFields).toEqual([]);
        expect(op.urlEncodedSchema).toBeUndefined();
    });

    it("flattens inline allOf multipart schemas into merged form fields (#72)", () => {
        const op = normalized.operations.find((o) => o.operationId === "uploadDocument")!;
        expect(op.isMultipart).toBe(true);
        expect(op.formDataFields).toEqual(["file", "note", "category"]);
        expect(op.formDataSchema?.properties?.file).toMatchObject({ type: "string", format: "binary" });
        expect(op.formDataSchema?.properties?.category).toMatchObject({ type: "string" });
        expect(op.formDataSchema?.required).toEqual(["file", "category"]);
        expect(op.formDataSchema?.type).toBe("object");
    });

    it("flattens allOf multipart schemas behind a $ref (#72)", () => {
        const op = normalized.operations.find((o) => o.operationId === "uploadComposedDocument")!;
        expect(op.formDataFields).toEqual(["file", "note", "tags"]);
        expect(op.formDataSchema?.required).toEqual(["file"]);
    });

    it("survives cyclic allOf refs without recursing forever", () => {
        const cyclic = normalizeSpec({
            openapi: "3.0.3",
            info: { title: "t", version: "1" },
            paths: {
                "/loop": {
                    post: {
                        operationId: "loop",
                        requestBody: {
                            content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/A" } } },
                        },
                        responses: { "200": { description: "ok" } },
                    },
                },
            },
            components: {
                schemas: {
                    A: {
                        allOf: [
                            { $ref: "#/components/schemas/A" },
                            { type: "object", properties: { name: { type: "string" } } },
                        ],
                    },
                },
            },
        } as unknown as SwaggerSpec);
        expect(cyclic.operations[0].formDataFields).toEqual(["name"]);
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
        expect(normalized.operations.find((o) => o.operationId === "getOrder")!.acceptHeader).toBe(
            "application/json",
        );
        expect(normalized.operations.find((o) => o.operationId === "token")!.acceptHeader).toBe("application/pdf");
        // 201 with no content → nothing to advertise
        expect(normalized.operations.find((o) => o.operationId === "upload")!.acceptHeader).toBeUndefined();
    });
});

describe("normalizeSchema (OpenAPI 3.1 constructs)", () => {
    it("folds null members of type arrays into nullable", () => {
        expect(normalizeSchema({ type: ["string", "null"] as unknown as string })).toMatchObject({
            type: "string",
            nullable: true,
        });
    });

    it("keeps format working on nullable 3.1 schemas", () => {
        const normalized = normalizeSchema({
            type: ["string", "null"] as unknown as string,
            format: "date-time",
        });
        expect(normalized).toMatchObject({ type: "string", format: "date-time", nullable: true });
    });

    it("keeps multi-type arrays as unions and handles null-only types", () => {
        const multi = normalizeSchema({ type: ["string", "number", "null"] as unknown as string });
        expect(multi.type).toEqual(["string", "number"]);
        expect(multi.nullable).toBe(true);

        expect(normalizeSchema({ type: ["null"] as unknown as string }).type).toBe("null");
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
                tag: { type: ["string", "null"] as unknown as string },
                list: { type: "array", items: { const: 1 } },
            },
            additionalProperties: { type: ["number", "null"] as unknown as string },
            oneOf: [{ const: "a" }],
        });
        expect(normalized.properties?.tag).toMatchObject({ type: "string", nullable: true });
        expect((normalized.properties?.list.items as { enum: unknown[] }).enum).toEqual([1]);
        expect(normalized.additionalProperties).toMatchObject({ type: "number", nullable: true });
        expect(normalized.oneOf?.[0].enum).toEqual(["a"]);
    });

    it("leaves 2.0/3.0-style schemas semantically untouched and never mutates input", () => {
        const input = { type: "string", format: "date", enum: ["a"] } as const;
        const copy = JSON.parse(JSON.stringify(input));
        const normalized = normalizeSchema(input as never);
        expect(normalized).toEqual(copy);
        expect(input).toEqual(copy);

        const arrayInput = { type: ["string", "null"] as unknown as string };
        normalizeSchema(arrayInput);
        expect(arrayInput.type).toEqual(["string", "null"]);
    });
});
