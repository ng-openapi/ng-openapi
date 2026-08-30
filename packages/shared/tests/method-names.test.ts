import { describe, expect, it } from "vitest";
import { getOperationMethodName, InvalidIdentifierError, MethodGenOptions, NormalizedOperation } from "../src";

const operation = (overrides: Partial<NormalizedOperation> = {}): NormalizedOperation =>
    ({
        path: "/pets/{id}",
        method: "GET",
        parameters: [],
        responses: {},
        tags: [],
        ...overrides,
    }) as NormalizedOperation;

const config = (customizeMethodName?: (operationId: string) => string): MethodGenOptions => ({
    options: { dateType: "string", customizeMethodName },
});

describe("getOperationMethodName without a customize hook", () => {
    it("camelCases the operationId", () => {
        expect(getOperationMethodName(operation({ operationId: "get_pet_by_id" }), config())).toBe("getPetById");
    });

    it("sanitizes an operationId with illegal characters (#125)", () => {
        expect(getOperationMethodName(operation({ operationId: "groups_{group_id}_delete" }), config())).toBe(
            "groupsGroupIdDelete",
        );
    });

    it("derives a name from path and method without an operationId", () => {
        expect(getOperationMethodName(operation(), config())).toBe("petsIdGet");
    });

    it("falls back to `resource` for a root path", () => {
        expect(getOperationMethodName(operation({ path: "/", method: "POST" }), config())).toBe("resourcePost");
    });
});

describe("getOperationMethodName with a customize hook", () => {
    it("uses the hook's result when it is a valid identifier", () => {
        expect(getOperationMethodName(operation({ operationId: "get_pet" }), config((id) => `${id}V2`))).toBe(
            "get_petV2",
        );
    });

    it("throws InvalidIdentifierError when the hook returns an unusable name", () => {
        const call = () =>
            getOperationMethodName(
                operation({ operationId: "groups_{group_id}_delete" }),
                config((id) => id),
            );

        expect(call).toThrow(InvalidIdentifierError);
        // The message has to name the operation: the old failure surfaced as an
        // opaque ts-morph error pointing at the service file, not the spec.
        expect(call).toThrow(/groups_\{group_id\}_delete/);
    });

    it("requires an operationId when a customize hook is configured", () => {
        // Typed, not a bare Error: hosts branch on the class, never on text.
        expect(() => getOperationMethodName(operation(), config((id) => id))).toThrow(InvalidIdentifierError);
        expect(() => getOperationMethodName(operation(), config((id) => id))).toThrow(/needs an operationId/);
    });
});
