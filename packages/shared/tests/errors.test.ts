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
        expect(new InvalidIdentifierError("x", { method: "GET", path: "/x" }, "a-b")).not.toBeInstanceOf(SpecLoadError);
    });

    /**
     * `@ng-openapi/shared` is private and bundled into each published plugin,
     * so a plugin throws an error built from its own inlined copy of these
     * classes. Prototype-chain `instanceof` fails across those copies; the
     * brand is what makes the check work for plugin users. Simulated here by
     * an object carrying the brand without the prototype.
     */
    /** How a plugin bundle's copy of these classes brands its errors. */
    const branded = (lineage: string[], message = "from a plugin bundle"): Error => {
        const error = new Error(message);
        Object.defineProperty(error, "__ngOpenApiError", { value: lineage, enumerable: false });
        return error;
    };

    it("recognizes a branded error from another bundled copy of the module", () => {
        const fromPluginBundle = branded(["InvalidIdentifierError", "NgOpenApiError"]);

        expect(fromPluginBundle).toBeInstanceOf(InvalidIdentifierError);
        expect(fromPluginBundle).toBeInstanceOf(NgOpenApiError);
        expect(fromPluginBundle).not.toBeInstanceOf(SpecLoadError);
    });

    it("ignores a brand that did not come from a constructor", () => {
        // JSON.parse produces enumerable own properties; the real brand is
        // non-enumerable, so this is data pretending to be an error.
        const fromJson = JSON.parse('{"__ngOpenApiError":["SpecLoadError","NgOpenApiError"]}');
        expect(fromJson).not.toBeInstanceOf(SpecLoadError);

        // Inherited, not own — the prototype-chain read this module fixes elsewhere.
        const inherited = Object.create(branded(["SpecLoadError", "NgOpenApiError"]));
        expect(inherited).not.toBeInstanceOf(SpecLoadError);
    });

    it("never runs foreign code while answering instanceof", () => {
        const hostile = new Error("hostile");
        Object.defineProperty(hostile, "__ngOpenApiError", {
            get() {
                throw new Error("getter should never run");
            },
            enumerable: false,
        });

        expect(() => hostile instanceof SpecLoadError).not.toThrow();
        expect(hostile).not.toBeInstanceOf(SpecLoadError);
    });

    it("freezes the lineage so instanceof cannot be rewritten after the fact", () => {
        const error = new SpecLoadError("x", "./s") as unknown as Record<string, string[]>;
        expect(() => error["__ngOpenApiError"].push("SpecParseError")).toThrow();
        expect(error).not.toBeInstanceOf(SpecParseError);
    });

    it("does not treat a parent as an instance of a subclass that adds no brand", () => {
        class TighterSpecLoadError extends SpecLoadError {}
        // `brand` is a static and therefore inherited; without an own brand the
        // prototype chain has to be the only answer.
        expect(new SpecLoadError("x", "./s")).not.toBeInstanceOf(TighterSpecLoadError);
    });

    it("matches a caller's own subclass through the prototype chain", () => {
        class TighterSpecLoadError extends SpecLoadError {}
        const error = new TighterSpecLoadError("x", "./s");

        expect(error).toBeInstanceOf(TighterSpecLoadError);
        expect(error).toBeInstanceOf(SpecLoadError);
        expect(error).toBeInstanceOf(NgOpenApiError);
    });

    it("keeps the brand out of serialized output", () => {
        const error = new SpecLoadError("could not read", "./spec.json");

        expect(Object.keys(error)).not.toContain("__ngOpenApiError");
        expect(JSON.stringify(error)).not.toContain("__ngOpenApiError");
    });

    it("leaves unbranded values alone", () => {
        expect(new Error("plain")).not.toBeInstanceOf(NgOpenApiError);
        expect(null).not.toBeInstanceOf(NgOpenApiError);
        expect("string").not.toBeInstanceOf(NgOpenApiError);
        expect({}).not.toBeInstanceOf(NgOpenApiError);
    });
});
