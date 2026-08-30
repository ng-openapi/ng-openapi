import { describe, expect, it } from "vitest";
import {
    ConfigLoadError,
    ConfigValidationError,
    DuplicateGeneratedNameError,
    InvalidIdentifierError,
    NgOpenApiError,
    SpecLoadError,
    SpecParseError,
    UnresolvedPathTemplateError,
} from "../src";
import type { OperationRef } from "../src";

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
    it("does not treat a parent as an instance of a subclass that adds no brand", () => {
        class TighterSpecLoadError extends SpecLoadError {}
        // `brand` is a static and therefore inherited; without an own brand the
        // prototype chain has to be the only answer.
        expect(new SpecLoadError("x", "./s")).not.toBeInstanceOf(TighterSpecLoadError);
    });

    it("answers rather than throwing for a hostile Proxy", () => {
        const hostile = new Proxy(new Error("hostile"), {
            getOwnPropertyDescriptor() {
                throw new Error("trap should not escape");
            },
        });

        expect(() => hostile instanceof SpecLoadError).not.toThrow();
        expect(hostile).not.toBeInstanceOf(SpecLoadError);
    });

    it("freezes the payload arrays it hands out", () => {
        const error = new ConfigValidationError(["one", "two"]);
        expect(() => (error.issues as string[]).push("three")).toThrow();
        expect(error.issues).toEqual(["one", "two"]);
    });

    it("brands ConfigValidationError like the rest of the hierarchy", () => {
        const error = new ConfigValidationError(["bad"]);
        expect(error).toBeInstanceOf(NgOpenApiError);
        // Asserting instanceof alone would pass through the prototype chain
        // whether or not it is branded, so check the brand a plugin bundle
        // would actually match on.
        const lineage = Object.getOwnPropertyDescriptor(error, "__ngOpenApiError")?.value;
        expect(lineage).toEqual(["ConfigValidationError", "NgOpenApiError"]);
        expect(branded(["ConfigValidationError", "NgOpenApiError"])).toBeInstanceOf(ConfigValidationError);
    });
    it("lets a consumer subclass without throwing at module-evaluation time", () => {
        // `static override brand = "X"` compiles to a plain assignment unless
        // useDefineForClassFields is on (it is off at this repo's target), so a
        // non-writable inherited static made this throw on import — the
        // consumer could not load their own module at all.
        expect(() => {
            class Tighter extends SpecLoadError {
                static brand = "Tighter";
            }
            return new Tighter("x", "./s");
        }).not.toThrow();
    });

    it("does not let an unregistered subclass claim its parent's instances", () => {
        class Tighter extends SpecLoadError {}
        expect(new SpecLoadError("x", "./s")).not.toBeInstanceOf(Tighter);
        expect(new Tighter("x", "./s")).toBeInstanceOf(SpecLoadError);
    });

    it("cannot have its lineage forged by a subclass", () => {
        // The lineage comes from the registry keyed on new.target, so there is
        // no constructor argument to pass a false one through.
        class Forged extends NgOpenApiError {
            constructor() {
                super("forged");
            }
        }
        expect(new Forged()).not.toBeInstanceOf(SpecLoadError);
        expect(new Forged()).toBeInstanceOf(NgOpenApiError);
    });

    it("answers rather than throwing for a Proxy that traps getPrototypeOf", () => {
        const hostile = new Proxy(new Error("hostile"), {
            getPrototypeOf() {
                throw new Error("trap should not escape");
            },
            getOwnPropertyDescriptor() {
                throw new Error("trap should not escape");
            },
        });

        expect(() => hostile instanceof SpecLoadError).not.toThrow();
        expect(hostile).not.toBeInstanceOf(SpecLoadError);
    });

    it("freezes every payload array it hands out", () => {
        const duplicate = new DuplicateGeneratedNameError("x", ["a"], [{ method: "GET", path: "/a" }]);
        expect(() => (duplicate.names as string[]).push("b")).toThrow();
        expect(() => (duplicate.operations as OperationRef[]).push({ method: "GET", path: "/b" })).toThrow();

        const unresolved = new UnresolvedPathTemplateError("x", "/a/{id}", ["id"]);
        expect(() => (unresolved.placeholders as string[]).push("other")).toThrow();

        expect(() => (new ConfigValidationError(["one"]).issues as string[]).push("two")).toThrow();
    });

    it("snapshots the operation rather than aliasing the caller's object", () => {
        const operation = { operationId: "op", method: "GET", path: "/a" };
        const error = new InvalidIdentifierError("x", operation, "bad");

        operation.operationId = "mutated";
        expect(error.operation.operationId).toBe("op");
        expect(() => ((error.operation as OperationRef).method = "POST")).toThrow();
    });
    it("walks the prototype chain to find a registered ancestor", () => {
        // Collapsing the walk to a direct lookup would leave a subclass instance
        // with the fallback lineage, so it would stop matching its own parent.
        class Deep extends SpecLoadError {}
        class Deeper extends Deep {}
        const error = new Deeper("x", "./s");

        const lineage = Object.getOwnPropertyDescriptor(error, "__ngOpenApiError")?.value;
        expect(lineage).toEqual(["SpecLoadError", "NgOpenApiError"]);
        expect(error.name).toBe("SpecLoadError");
    });

    it("freezes the fallback lineage it hands to a class outside the hierarchy", () => {
        // Only reachable with a new.target that is not in NgOpenApiError's
        // chain, since the base itself is registered and the walk terminates
        // there for every ordinary subclass. Constructing through an unrelated
        // target is the one way in — and the earlier version of this test used
        // an ordinary subclass, so it asserted the registered lineage's
        // frozenness instead and passed with the fallback removed entirely.
        class Unrelated {}
        const error = Reflect.construct(NgOpenApiError, ["x"], Unrelated) as Error;

        const lineage = Object.getOwnPropertyDescriptor(error, "__ngOpenApiError")?.value as string[];
        expect(lineage).toEqual(["NgOpenApiError"]);
        // Pushing to it would upgrade this instance's instanceof.
        expect(() => lineage.push("SpecLoadError")).toThrow();
        expect(error).not.toBeInstanceOf(SpecLoadError);
    });

    it("serializes the parts a log actually needs", () => {
        // message is non-enumerable on Error, so the default JSON.stringify
        // dropped it and emitted `cause: undefined` instead.
        const error = new SpecLoadError("could not read", "./spec.json", new Error("ENOENT"));
        const json = JSON.parse(JSON.stringify(error)) as Record<string, unknown>;

        expect(json["message"]).toBe("could not read");
        expect(json["name"]).toBe("SpecLoadError");
        expect(json["cause"]).toBe("ENOENT");
        expect(json).not.toHaveProperty("__ngOpenApiError");
    });

    it("omits cause rather than emitting it as undefined", () => {
        const json = JSON.parse(JSON.stringify(new SpecLoadError("x", "./s"))) as Record<string, unknown>;
        expect(json).not.toHaveProperty("cause");
    });

    it("keeps the brand and the prototype chain agreeing", () => {
        // Two independent answers to the same question; a divergence would mean
        // instanceof depends on which copy of the module a caller imported.
        for (const error of [
            new SpecLoadError("x", "./s"),
            new SpecParseError("x"),
            new InvalidIdentifierError("x", { method: "GET", path: "/a" }),
            new ConfigValidationError(["x"]),
            new ConfigLoadError("x", "./c"),
        ]) {
            const lineage = Object.getOwnPropertyDescriptor(error, "__ngOpenApiError")?.value as string[];
            expect(lineage[0], error.name).toBe(error.constructor.name);
            expect(lineage).toContain("NgOpenApiError");
            expect(error, error.name).toBeInstanceOf(NgOpenApiError);
        }
    });
});
