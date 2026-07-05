import { describe, expect, it } from "vitest";
import { GeneratorConfig, getRequestBodyType } from "@ng-openapi/shared";

const config: GeneratorConfig = {
    input: "spec.json",
    output: "out",
    options: { dateType: "string", enumStyle: "union" },
};

describe("getRequestBodyType", () => {
    it("resolves the json content schema", () => {
        expect(
            getRequestBodyType(
                { content: { "application/json": { schema: { $ref: "#/components/schemas/CreateOrderRequest" } } } },
                config,
            ),
        ).toBe("CreateOrderRequest");
    });

    it("returns any when there is no content", () => {
        expect(getRequestBodyType({}, config)).toBe("any");
    });

    it("returns any when only non-json content exists", () => {
        expect(
            getRequestBodyType({ content: { "multipart/form-data": { schema: { type: "object" } } } }, config),
        ).toBe("any");
    });
});
