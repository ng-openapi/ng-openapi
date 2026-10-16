import { describe, expect, it } from "vitest";
import { createComponentResolvers } from "../src";
import type { SwaggerSpec } from "../src";

const spec = {
    openapi: "3.0.3",
    components: {
        parameters: { Limit: { name: "limit", in: "query" } },
        responses: {
            Ok: { description: "ok" },
            Alias: { $ref: "#/components/responses/Ok" },
            "a/b~c": { description: "escaped" },
            Loop: { $ref: "#/components/responses/Loop2" },
            Loop2: { $ref: "#/components/responses/Loop" },
            NotAnObject: "nope",
            AnArray: [{ description: "ok" }],
            ToSchema: { $ref: "#/components/schemas/Ok" },
            ToMissing: { $ref: "#/components/responses/Missing" },
        },
        requestBodies: { Body: { content: {} } },
        schemas: { Ok: { type: "object" } },
    },
} as unknown as SwaggerSpec;

describe("createComponentResolvers", () => {
    const { parameter, response, requestBody } = createComponentResolvers(spec);

    it("resolves each kind by its whole pointer", () => {
        expect(parameter("#/components/parameters/Limit")).toEqual({ value: { name: "limit", in: "query" } });
        expect(response("#/components/responses/Ok")).toEqual({ value: { description: "ok" } });
        expect(requestBody("#/components/requestBodies/Body")).toEqual({ value: { content: {} } });
    });

    it("follows a chain of component references", () => {
        expect(response("#/components/responses/Alias")).toEqual({ value: { description: "ok" } });
    });

    it("unescapes ~1 and ~0 in the component name", () => {
        expect(response("#/components/responses/a~1b~0c")).toEqual({ value: { description: "escaped" } });
    });

    it("never binds a same-named component of another kind", () => {
        expect(response("#/components/schemas/Ok")).toEqual({
            problem: 'is not a response component pointer (expected "#/components/responses/<name>")',
        });
    });

    it("says why a pointer does not resolve", () => {
        expect(response("#/components/responses/Missing")).toEqual({
            problem: 'does not resolve: there is no response component named "Missing"',
        });
        expect(response("#/components/responses/NotAnObject")).toEqual({
            problem: 'does not resolve: the response component "NotAnObject" is not an object',
        });
        expect(response("#/components/responses/AnArray")).toEqual({
            problem: 'does not resolve: the response component "AnArray" is not an object',
        });
        expect(requestBody("other.yaml#/components/requestBodies/Body")).toEqual({
            problem:
                'points into another document ("other.yaml"); references into other documents are not supported, ' +
                "so bundle the spec into one document first",
        });
        expect(response("#/components/responses/Loop")).toEqual({
            problem:
                'is part of a reference cycle ("#/components/responses/Loop" -> "#/components/responses/Loop2" -> ' +
                '"#/components/responses/Loop")',
        });
    });

    it("names the hop that broke when a chain breaks part-way", () => {
        expect(response("#/components/responses/ToSchema")).toEqual({
            problem:
                'leads to "#/components/schemas/Ok", which is not a response component pointer ' +
                '(expected "#/components/responses/<name>")',
        });
        expect(response("#/components/responses/ToMissing")).toEqual({
            problem:
                'leads to "#/components/responses/Missing", which does not resolve: there is no response ' +
                'component named "Missing"',
        });
    });

    it("looks up own properties only", () => {
        expect(response("#/components/responses/constructor")).toHaveProperty("problem");
        expect(response("#/components/responses/__proto__")).toHaveProperty("problem");
    });

    it("resolves Swagger 2.0 top-level maps, which have no request bodies", () => {
        const v2 = createComponentResolvers({
            swagger: "2.0",
            parameters: { Limit: { name: "limit", in: "query" } },
            responses: { NotFound: { description: "not found" } },
        } as unknown as SwaggerSpec);
        expect(v2.parameter("#/parameters/Limit")).toEqual({ value: { name: "limit", in: "query" } });
        expect(v2.response("#/responses/NotFound")).toEqual({ value: { description: "not found" } });
        expect(v2.response("#/components/responses/NotFound")).toEqual({
            problem: 'is not a response component pointer (expected "#/responses/<name>")',
        });
        expect(v2.requestBody("#/components/requestBodies/Body")).toEqual({
            problem: "is not supported: Swagger 2.0 has no reusable request body components",
        });
    });
});
