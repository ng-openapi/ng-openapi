import { describe, expect, it } from "vitest";
import { normalizeSpec, SwaggerSpec } from "../src";

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
});
