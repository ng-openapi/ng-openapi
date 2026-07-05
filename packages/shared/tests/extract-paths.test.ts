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
});
