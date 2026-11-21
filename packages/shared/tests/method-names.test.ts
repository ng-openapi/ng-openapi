import { describe, expect, it } from "vitest";
import {
    getOperationMethodName,
    InvalidIdentifierError,
    MethodGenOptions,
    NormalizedOperation,
    RESERVED_MEMBER_NAMES,
    reservedMemberCollision,
} from "../src";

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

describe("a derived name that is a member the generated class binds", () => {
    // Reachable since additionalOperations: the fixed suffixes (Get, Post, …)
    // never spelled one of these names.
    it.each([
        [{ path: "/http", method: "CLIENT" }, "httpClient"],
        [{ path: "/base", method: "PATH" }, "basePath"],
    ])("renames the name built from %o instead of failing the run", (fields, natural) => {
        const withoutId = operation({ ...fields, operationId: undefined });

        expect(getOperationMethodName(withoutId, config())).toBe(`_${natural}`);
        expect(reservedMemberCollision(withoutId, config())).toEqual({
            from: natural,
            to: `_${natural}`,
            // There is no operationId to rename.
            remedy: "Give the operation an operationId to choose the name.",
        });
    });

    it("says to rename the operationId when the name came from one", () => {
        const withId = operation({ operationId: "base_path" });

        expect(getOperationMethodName(withId, config())).toBe("_basePath");
        expect(reservedMemberCollision(withId, config())).toEqual({
            from: "basePath",
            to: "_basePath",
            remedy: "Rename the operationId to choose the name.",
        });
    });

    it("reports nothing for a name that is free", () => {
        expect(reservedMemberCollision(operation(), config())).toBeUndefined();
        expect(reservedMemberCollision(operation({ operationId: "getPet" }), config())).toBeUndefined();
    });
});

describe("getOperationMethodName with a customize hook", () => {
    it("uses the hook's result when it is a valid identifier", () => {
        expect(
            getOperationMethodName(
                operation({ operationId: "get_pet" }),
                config((id) => `${id}V2`),
            ),
        ).toBe("get_petV2");
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
        expect(() =>
            getOperationMethodName(
                operation(),
                config((id) => id),
            ),
        ).toThrow(InvalidIdentifierError);
        expect(() =>
            getOperationMethodName(
                operation(),
                config((id) => id),
            ),
        ).toThrow(/needs an operationId/);
    });
});

describe("RESERVED_MEMBER_NAMES", () => {
    it("cannot be mutated through a cast", () => {
        // A Set typed ReadonlySet is mutable process-wide through one cast;
        // Object.freeze does not stop Set.add, so the export is a frozen array.
        expect(Object.isFrozen(RESERVED_MEMBER_NAMES)).toBe(true);
        expect(() => (RESERVED_MEMBER_NAMES as string[]).push("x")).toThrow();
    });
});
