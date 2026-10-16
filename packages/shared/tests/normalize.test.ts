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
