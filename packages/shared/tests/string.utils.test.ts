import { describe, expect, it } from "vitest";
import { camelCase, kebabCase, pascalCase, pascalCaseForEnums, screamingSnakeCase } from "@ng-openapi/shared";

describe("camelCase", () => {
    it("converts kebab-case", () => {
        expect(camelCase("user-name")).toBe("userName");
    });

    it("converts snake_case", () => {
        expect(camelCase("user_name")).toBe("userName");
    });

    it("treats dots as word separators (#91)", () => {
        expect(camelCase("api.response")).toBe("apiResponse");
        expect(camelCase("filter.name")).toBe("filterName");
    });

    it("converts spaces", () => {
        expect(camelCase("display name")).toBe("displayName");
    });

    it("lowercases a leading uppercase letter", () => {
        expect(camelCase("UserName")).toBe("userName");
    });

    it("keeps an already camelCased word", () => {
        expect(camelCase("userName")).toBe("userName");
    });

    it("handles trailing separators", () => {
        expect(camelCase("user-")).toBe("user");
    });
});

describe("pascalCase", () => {
    it("converts kebab-case", () => {
        expect(pascalCase("user-profile")).toBe("UserProfile");
    });

    it("treats dots as word separators (#91)", () => {
        expect(pascalCase("api.response")).toBe("ApiResponse");
    });

    it("uppercases a leading lowercase letter", () => {
        expect(pascalCase("status")).toBe("Status");
    });

    it("collapses consecutive separators", () => {
        expect(pascalCase("a--b__c")).toBe("ABC");
    });
});

describe("kebabCase", () => {
    it("converts PascalCase", () => {
        expect(kebabCase("UserProfile")).toBe("user-profile");
    });

    it("converts camelCase", () => {
        expect(kebabCase("userProfile")).toBe("user-profile");
    });

    it("normalizes underscores and spaces", () => {
        expect(kebabCase("user_profile name")).toBe("user-profile-name");
    });
});

describe("screamingSnakeCase", () => {
    it("converts camelCase", () => {
        expect(screamingSnakeCase("basePath")).toBe("BASE_PATH");
    });

    it("converts kebab-case and spaces", () => {
        expect(screamingSnakeCase("base-path token")).toBe("BASE_PATH_TOKEN");
    });
});

describe("pascalCaseForEnums", () => {
    it("converts kebab-case schema names", () => {
        expect(pascalCaseForEnums("user-profile")).toBe("UserProfile");
    });

    it("converts dotted schema names", () => {
        expect(pascalCaseForEnums("api.response")).toBe("ApiResponse");
    });

    it("prefixes names starting with a digit", () => {
        expect(pascalCaseForEnums("123meta")).toBe("_123meta");
    });

    it("replaces every non-alphanumeric character", () => {
        expect(pascalCaseForEnums("weird name!x")).toBe("WeirdNameX");
    });

    it("keeps already valid PascalCase names", () => {
        expect(pascalCaseForEnums("OrderStatus")).toBe("OrderStatus");
    });
});
