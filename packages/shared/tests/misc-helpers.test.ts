import { describe, expect, it } from "vitest";
import {
    generateParseRequestTypeParams,
    getBasePathTokenName,
    getClientContextTokenName,
    getInterceptorsTokenName,
    isDataTypeInterface,
} from "../src";

describe("token names", () => {
    it("defaults to the DEFAULT client suffix", () => {
        expect(getBasePathTokenName()).toBe("BASE_PATH_DEFAULT");
        expect(getClientContextTokenName()).toBe("CLIENT_CONTEXT_TOKEN_DEFAULT");
        expect(getInterceptorsTokenName()).toBe("HTTP_INTERCEPTORS_DEFAULT");
    });

    it("uppercases and sanitizes the client name", () => {
        expect(getBasePathTokenName("PetsApi")).toBe("BASE_PATH_PETSAPI");
        expect(getBasePathTokenName("my-client v2")).toBe("BASE_PATH_MY_CLIENT_V2");
    });
});

describe("isDataTypeInterface", () => {
    it("rejects primitives and built-ins", () => {
        for (const type of ["any", "string", "number", "boolean", "unknown", "File", "Blob[]", "Array<string>"]) {
            expect(isDataTypeInterface(type), type).toBe(false);
        }
    });

    it("accepts generated interface names", () => {
        expect(isDataTypeInterface("Pet")).toBe(true);
        expect(isDataTypeInterface("CreateOrderRequest")).toBe(true);
    });
});

describe("generateParseRequestTypeParams", () => {
    it("returns the first interface-typed parameter", () => {
        expect(
            generateParseRequestTypeParams([
                { name: "id", type: "string" },
                { name: "body", type: "CreateOrderRequest" },
            ]),
        ).toBe("CreateOrderRequest");
    });

    it("appends | undefined for optional parameters", () => {
        expect(generateParseRequestTypeParams([{ name: "body", type: "Pet", hasQuestionToken: true }])).toBe(
            "Pet | undefined",
        );
    });

    it("returns an empty string when no interface parameter exists", () => {
        expect(generateParseRequestTypeParams([{ name: "id", type: "string" }])).toBe("");
    });
});
