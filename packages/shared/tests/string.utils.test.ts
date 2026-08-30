import { describe, expect, it } from "vitest";
import { camelCase, isValidIdentifier, kebabCase, pascalCase, pascalCaseForEnums, screamingSnakeCase } from "../src";

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

    // #125: braces in an operationId reached the emitted method name verbatim
    it("treats characters illegal in an identifier as separators (#125)", () => {
        expect(camelCase("groups_{group_id}_delete")).toBe("groupsGroupIdDelete");
        expect(camelCase("get/pets:byStatus")).toBe("getPetsByStatus");
        expect(camelCase("weird name!x")).toBe("weirdNameX");
    });

    it("prefixes a leading digit", () => {
        expect(camelCase("2fa_verify")).toBe("_2faVerify");
    });

    it("keeps $, which is legal in an identifier", () => {
        expect(camelCase("$top")).toBe("$top");
        expect(camelCase("$select")).toBe("$select");
    });

    it("keeps Unicode letters, which are legal in an identifier", () => {
        expect(camelCase("größe")).toBe("größe");
        expect(camelCase("benutzer_größe")).toBe("benutzerGröße");
    });

    it("falls back to _ when nothing identifier-legal remains", () => {
        expect(camelCase("{}")).toBe("_");
        expect(camelCase("")).toBe("");
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

    // #125: a tag like this became the class name `Groups(yes)Service`
    it("treats characters illegal in an identifier as separators (#125)", () => {
        expect(pascalCase("Groups (yes)")).toBe("GroupsYes");
        expect(pascalCase("Pet Store & Co.")).toBe("PetStoreCo");
    });

    it("prefixes a leading digit", () => {
        expect(pascalCase("3d-models")).toBe("_3dModels");
    });

    it("falls back to _ when nothing identifier-legal remains", () => {
        expect(pascalCase("()")).toBe("_");
        expect(pascalCase("")).toBe("");
    });
});

describe("isValidIdentifier", () => {
    it("accepts identifiers TypeScript accepts", () => {
        for (const name of ["getPets", "_private", "$top", "größe", "a1"]) {
            expect(isValidIdentifier(name), name).toBe(true);
        }
    });

    it("rejects empty, digit-leading and punctuated names", () => {
        for (const name of ["", "2fa", "get pets", "groups{groupId}Delete", "a-b"]) {
            expect(isValidIdentifier(name), name).toBe(false);
        }
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
