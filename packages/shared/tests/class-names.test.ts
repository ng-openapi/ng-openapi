import { describe, expect, it } from "vitest";
import { getModelTypeName, getResourceClassName, getServiceClassName } from "@ng-openapi/shared";

describe("getServiceClassName", () => {
    it("appends the default Service suffix", () => {
        expect(getServiceClassName("Role")).toBe("RoleService");
    });

    it("pascal-cases the controller name", () => {
        expect(getServiceClassName("user-accounts")).toBe("UserAccountsService");
    });

    it("prepends a prefix while keeping the default suffix", () => {
        expect(getServiceClassName("Role", { prefix: "Api" })).toBe("ApiRoleService");
    });

    it("replaces the default suffix", () => {
        expect(getServiceClassName("Role", { suffix: "ApiService" })).toBe("RoleApiService");
    });

    it("drops the default suffix for an empty-string suffix", () => {
        expect(getServiceClassName("Role", { suffix: "" })).toBe("Role");
    });
});

describe("getResourceClassName", () => {
    it("appends the default Resource suffix", () => {
        expect(getResourceClassName("Orders")).toBe("OrdersResource");
    });

    it("applies prefix and replacement suffix", () => {
        expect(getResourceClassName("Orders", { prefix: "Api", suffix: "Gateway" })).toBe("ApiOrdersGateway");
    });
});

describe("getModelTypeName", () => {
    it("has no default suffix", () => {
        expect(getModelTypeName("User")).toBe("User");
    });

    it("sanitizes raw schema names like pascalCaseForEnums", () => {
        expect(getModelTypeName("user_dto")).toBe("UserDto");
        expect(getModelTypeName("123name")).toBe("_123name");
    });

    it("applies prefix and suffix around the sanitized name", () => {
        expect(getModelTypeName("user_dto", { prefix: "Api", suffix: "Model" })).toBe("ApiUserDtoModel");
    });
});
