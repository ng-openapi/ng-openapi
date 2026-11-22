import { describe, expect, it } from "vitest";
import { GeneratorConfig, getRequestBodyType } from "../src";

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

    it.each(["application/merge-patch+json", "application/json; charset=utf-8", "application/vnd.api+json"])(
        "resolves a JSON body declared as %s",
        (contentType) => {
            expect(
                getRequestBodyType(
                    {
                        content: {
                            "text/plain": { schema: { type: "string" } },
                            [contentType]: { schema: { $ref: "#/components/schemas/WidgetPatch" } },
                        },
                    },
                    config,
                ),
            ).toBe("WidgetPatch");
        },
    );

    it("reads exactly application/json first, wherever it is declared", () => {
        expect(
            getRequestBodyType(
                {
                    content: {
                        "application/json-patch+json": { schema: { $ref: "#/components/schemas/JsonPatch" } },
                        "application/json": { schema: { $ref: "#/components/schemas/Widget" } },
                    },
                },
                config,
            ),
        ).toBe("Widget");
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
