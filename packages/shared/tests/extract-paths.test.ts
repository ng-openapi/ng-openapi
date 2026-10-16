import { describe, expect, it } from "vitest";
import { extractPaths } from "../src";

describe("extractPaths", () => {
    it("extracts one PathInfo per method, method uppercased", () => {
        const paths = extractPaths({
            "/pets": {
                get: { operationId: "listPets", responses: {} },
                post: { operationId: "createPet", responses: {} },
            },
        } as never);

        expect(paths).toHaveLength(2);
        expect(paths[0]).toMatchObject({ path: "/pets", method: "GET", operationId: "listPets" });
        expect(paths[1]).toMatchObject({ path: "/pets", method: "POST", operationId: "createPet" });
    });

    it("ignores non-operation keys and unknown methods", () => {
        const paths = extractPaths({
            "/pets": {
                summary: "not an operation",
                trace: { operationId: "ignored" },
                get: { operationId: "listPets" },
            },
        } as never);

        expect(paths).toHaveLength(1);
        expect(paths[0].operationId).toBe("listPets");
    });

    it("merges path-level parameters before operation parameters", () => {
        const paths = extractPaths({
            "/pets/{petId}": {
                parameters: [{ name: "petId", in: "path", schema: { type: "string" } }],
                get: {
                    operationId: "getPet",
                    parameters: [{ name: "verbose", in: "query", schema: { type: "boolean" } }],
                },
            },
        } as never);

        expect(paths[0].parameters?.map((p) => p.name)).toEqual(["petId", "verbose"]);
    });

    it("forces required=true for path parameters", () => {
        const paths = extractPaths({
            "/pets/{petId}": {
                get: {
                    parameters: [
                        { name: "petId", in: "path", schema: { type: "string" } },
                        { name: "verbose", in: "query", schema: { type: "boolean" } },
                    ],
                },
            },
        } as never);

        const [petId, verbose] = paths[0].parameters ?? [];
        expect(petId.required).toBe(true);
        expect(verbose.required).toBe(false);
    });

    it("defaults tags to an empty array and responses to an empty object", () => {
        const paths = extractPaths({ "/pets": { get: {} } } as never);
        expect(paths[0].tags).toEqual([]);
        expect(paths[0].responses).toEqual({});
    });

    it("returns an empty array for missing paths", () => {
        expect(extractPaths(undefined)).toEqual([]);
    });

    it("replaces $ref request bodies and responses with the component the resolver returns", () => {
        const body = { content: { "application/json": { schema: { type: "string" as const } } } };
        const ok = { description: "ok" };
        const paths = extractPaths(
            {
                "/pets": {
                    post: {
                        requestBody: { $ref: "#/components/requestBodies/B" },
                        responses: { "200": { $ref: "#/components/responses/Ok" }, "204": { description: "inline" } },
                    },
                },
            } as never,
            undefined,
            undefined,
            {
                requestBody: (ref) => (ref === "#/components/requestBodies/B" ? { value: body } : { problem: "x" }),
                response: (ref) => (ref === "#/components/responses/Ok" ? { value: ok } : { problem: "x" }),
            },
        );

        expect(paths[0].requestBody).toBe(body);
        expect(paths[0].responses).toEqual({ "200": ok, "204": { description: "inline" } });
    });

    it("skips a $ref its resolver cannot resolve, out loud, and keeps the rest of the operation", () => {
        const warnings: string[] = [];
        const paths = extractPaths(
            {
                "/pets": {
                    post: {
                        requestBody: { $ref: "#/components/requestBodies/B" },
                        responses: {
                            "200": { $ref: "#/components/responses/Ok" },
                            "204": { description: "inline" },
                            "400": { $ref: "#/components/responses/Bad" },
                        },
                    },
                },
            } as never,
            undefined,
            (message) => warnings.push(message),
            { requestBody: () => ({ problem: "is broken" }), response: () => ({ problem: "is broken" }) },
        );

        expect(paths[0].requestBody).toBeUndefined();
        expect(paths[0].responses).toEqual({ "204": { description: "inline" } });
        expect(warnings).toEqual([
            'The request body of (POST) /pets references "#/components/requestBodies/B", which is broken. The ' +
                "request body was skipped: generated methods take no body and no validator is generated for it.",
            'The "200" response of (POST) /pets references "#/components/responses/Ok", which is broken. The ' +
                "response was skipped: no validator is generated from it, and the method's return type and " +
                "response type come from its other success responses — `any`, read as JSON, if none is left.",
            'The "400" response of (POST) /pets references "#/components/responses/Bad", which is broken. The ' +
                "response was skipped: no validator is generated from it.",
        ]);
    });

    it("without resolvers, passes $ref bodies and responses through and skips $ref parameters, as before", () => {
        const warnings: string[] = [];
        const operation = {
            parameters: [{ $ref: "#/components/parameters/Limit" }],
            requestBody: { $ref: "#/components/requestBodies/B" },
            responses: { "200": { $ref: "#/components/responses/Ok" } },
        };
        const paths = extractPaths({ "/pets": { post: operation } } as never, undefined, (message) =>
            warnings.push(message),
        );

        expect(paths[0].parameters).toEqual([]);
        expect(paths[0].requestBody).toBe(operation.requestBody);
        expect(paths[0].responses).toEqual(operation.responses);
        expect(warnings).toEqual([
            'A parameter of (POST) /pets references "#/components/parameters/Limit", which cannot be resolved ' +
                "here: no reusable parameters were provided. The parameter was skipped.",
        ]);
    });

    it("still accepts the parameter-only resolver function of the old signature", () => {
        const paths = extractPaths(
            { "/pets": { get: { parameters: [{ $ref: "#/components/parameters/Limit" }] } } } as never,
            undefined,
            undefined,
            (ref) =>
                ref === "#/components/parameters/Limit"
                    ? { parameter: { name: "limit", in: "query" } }
                    : { problem: "x" },
        );

        expect(paths[0].parameters?.map((p) => p.name)).toEqual(["limit"]);
    });

    it("resolves path-level $ref parameters too", () => {
        const paths = extractPaths(
            {
                "/pets/{petId}": {
                    parameters: [{ $ref: "#/components/parameters/PetId" }],
                    get: { parameters: [{ name: "verbose", in: "query" }] },
                },
            } as never,
            undefined,
            undefined,
            { parameter: () => ({ value: { name: "petId", in: "path" } }) },
        );

        expect(paths[0].parameters?.map((p) => p.name)).toEqual(["petId", "verbose"]);
    });

    it("skips, out loud, a response that is not an object", () => {
        const warnings: string[] = [];
        const paths = extractPaths(
            { "/pets": { get: { responses: { "200": null, "404": { description: "inline" } } } } } as never,
            undefined,
            (message) => warnings.push(message),
        );

        expect(paths[0].responses).toEqual({ "404": { description: "inline" } });
        expect(warnings).toEqual([
            'The "200" response of (GET) /pets is not an object. The response was skipped: no validator is ' +
                "generated from it, and the method's return type and response type come from its other success " +
                "responses — `any`, read as JSON, if none is left.",
        ]);
    });
});
