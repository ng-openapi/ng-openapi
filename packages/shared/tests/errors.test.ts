import { describe, expect, it } from "vitest";
import { InvalidIdentifierError, NgOpenApiError, SpecLoadError, SpecParseError } from "../src";

describe("typed errors", () => {
    it("keeps the concrete class name and cause", () => {
        const cause = new Error("boom");
        const error = new SpecLoadError("could not read", "./spec.json", cause);

        expect(error.name).toBe("SpecLoadError");
        expect(error.source).toBe("./spec.json");
        expect(error.cause).toBe(cause);
        expect(error).toBeInstanceOf(SpecLoadError);
        expect(error).toBeInstanceOf(NgOpenApiError);
        expect(error).toBeInstanceOf(Error);
    });

    it("does not match a sibling error class", () => {
        expect(new SpecLoadError("x", "./s")).not.toBeInstanceOf(SpecParseError);
        expect(new InvalidIdentifierError("x", "a-b")).not.toBeInstanceOf(SpecLoadError);
    });

    /**
     * `@ng-openapi/shared` is private and bundled into each published plugin,
     * so a plugin throws an error built from its own inlined copy of these
     * classes. Prototype-chain `instanceof` fails across those copies; the
     * brand is what makes the check work for plugin users. Simulated here by
     * an object carrying the brand without the prototype.
     */
    it("recognizes a branded error from another bundled copy of the module", () => {
        const fromPluginBundle = Object.assign(new Error("customizeMethodName returned …"), {
            name: "InvalidIdentifierError",
            __ngOpenApiError: "InvalidIdentifierError",
            identifier: "groups{x}Delete",
        });

        expect(fromPluginBundle).toBeInstanceOf(InvalidIdentifierError);
        expect(fromPluginBundle).toBeInstanceOf(NgOpenApiError);
        expect(fromPluginBundle).not.toBeInstanceOf(SpecLoadError);
    });

    it("leaves unbranded values alone", () => {
        expect(new Error("plain")).not.toBeInstanceOf(NgOpenApiError);
        expect(null).not.toBeInstanceOf(NgOpenApiError);
        expect("string").not.toBeInstanceOf(NgOpenApiError);
        expect({}).not.toBeInstanceOf(NgOpenApiError);
    });
});
