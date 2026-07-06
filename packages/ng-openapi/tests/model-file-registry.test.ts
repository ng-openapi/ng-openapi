import { describe, expect, it } from "vitest";
import { ModelFileRegistry } from "../src/lib/generators/type/model-file-registry";

describe("ModelFileRegistry", () => {
    it("kebab-cases raw schema names", () => {
        const registry = new ModelFileRegistry();
        expect(registry.reserveForSchema("UserProfile")).toBe("user-profile");
        expect(registry.reserveForSchema("order_item")).toBe("order-item");
        expect(registry.fileNameFor("UserProfile")).toBe("user-profile");
    });

    it("sanitizes characters kebabCase leaves alone", () => {
        const registry = new ModelFileRegistry();
        expect(registry.reserveForSchema("api.response")).toBe("api-response");
        expect(registry.reserveForSchema("...")).toBe("model");
    });

    it("suffixes colliding file names in declaration order and warns", () => {
        const warnings: string[] = [];
        const registry = new ModelFileRegistry((message) => warnings.push(message));
        expect(registry.reserveForSchema("UserProfile")).toBe("user-profile");
        expect(registry.reserveForSchema("user_profile")).toBe("user-profile-2");
        expect(registry.reserveForSchema("user profile")).toBe("user-profile-3");
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain('"user_profile"');
        expect(warnings[0]).toContain('"user-profile-2.ts"');
    });

    it("keeps exact reservations out of reach of schemas", () => {
        const registry = new ModelFileRegistry();
        expect(registry.reserveExact("request-options")).toBe("request-options");
        expect(registry.reserveForSchema("RequestOptions")).toBe("request-options-2");
        // exact reservations are not schema files
        expect(registry.schemaFileNames).toEqual(["request-options-2"]);
    });

    it("lists reserved schema file names", () => {
        const registry = new ModelFileRegistry();
        registry.reserveForSchema("Pet");
        registry.reserveForSchema("Order");
        expect(registry.schemaFileNames).toEqual(["pet", "order"]);
    });
});
