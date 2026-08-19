import { describe, expect, it } from "vitest";
import { escapeTemplateLiteral, quoteLiteral } from "../src";

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
    const cases = ["plain", "/a/`b", "/a/${b}", String.raw`/a/\b`, "/a/`${b}`"];

    for (const value of cases) {
        it(`round-trips ${JSON.stringify(value)} inside a template literal`, () => {
            expect(meaning("`" + escapeTemplateLiteral(value) + "`")).toBe(value);
        });
    }
});
