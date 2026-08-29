import { describe, expect, it } from "vitest";
import { emitPropertyName, escapeSingleQuoted, escapeTemplateLiteral, quoteLiteral } from "../src";

/**
 * These assertions evaluate the emitted literal rather than eyeballing its
 * text: the whole point is that the literal must *mean* the original string,
 * and a wrong escape is either a syntax error or — worse — a silently
 * different value.
 */
const meaning = (literal: string): unknown => new Function(`return ${literal};`)();

describe("quoteLiteral", () => {
    const cases = [
        "plain",
        "it's",
        String.raw`back\slash`,
        "both" + "\\" + "'",
        "quote-at-end'",
        "${notInterpolated}",
        "`backtick`",
        'double"quote',
    ];

    for (const value of cases) {
        it(`round-trips ${JSON.stringify(value)}`, () => {
            expect(meaning(quoteLiteral(value))).toBe(value);
        });
    }

    it("escapes newlines rather than emitting an unterminated literal", () => {
        expect(meaning(quoteLiteral("a\nb"))).toBe("a\nb");
        expect(quoteLiteral("a\nb")).not.toContain("\n");
    });
});

describe("escapeTemplateLiteral", () => {
    const cases = ["plain", "/a/`b", "/a/${b}", String.raw`/a/\b`, "/a/`${b}`", "a\rb", "a\r\nb"];

    for (const value of cases) {
        it(`round-trips ${JSON.stringify(value)} inside a template literal`, () => {
            expect(meaning("`" + escapeTemplateLiteral(value) + "`")).toBe(value);
        });
    }
});

describe("escaper consolidation", () => {
    /**
     * These were four near-copies that each missed a different character. An
     * identity assertion is what stops one being re-inlined: behaviour tests
     * would pass against a fresh copy that happened to be correct today.
     */
    it("routes every escaper through this module", async () => {
        const [{ escapeString: sharedEscape }, typeResolver] = await Promise.all([
            import("../src"),
            import("../../ng-openapi/src/lib/generators/type/type-resolver"),
        ]);

        expect(sharedEscape).toBe(escapeSingleQuoted);
        expect(typeResolver.escapeString).toBe(escapeSingleQuoted);
        expect(typeResolver.sanitizePropertyName).toBe(emitPropertyName);
    });
});
