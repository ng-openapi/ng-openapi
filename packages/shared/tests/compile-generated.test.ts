import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { expectGeneratedCodeCompiles } from "@ng-openapi/testing";

/**
 * The compile assertion is what every naming regression test ultimately rests
 * on, so its own failure modes need covering: a guard that reports success
 * while checking nothing is worse than no guard.
 */

const tmpRoot = join(process.cwd(), "tmp", "ng-openapi-tests");
mkdirSync(tmpRoot, { recursive: true });
const dirs: string[] = [];

afterAll(() => {
    for (const dir of dirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            // best-effort cleanup
        }
    }
});

function withFile(header: string, body: string): string {
    const dir = mkdtempSync(join(tmpRoot, "compile-guard-"));
    dirs.push(dir);
    writeFileSync(join(dir, "generated.ts"), `${header}\n${body}\n`);
    return dir;
}

const TYPE_ERROR = 'const probe: number = "not a number";';

it("passes clean generated code", () => {
    expect(() => expectGeneratedCodeCompiles(withFile("// @ts-nocheck", "export const ok = 1;"))).not.toThrow();
});

it("fails on a type error once the directive is stripped", () => {
    expect(() => expectGeneratedCodeCompiles(withFile("// @ts-nocheck", TYPE_ERROR))).toThrow();
});

/**
 * The exact-match strip this replaced no-opped against any header that merely
 * contained the token, leaving the directive in force while still counting as
 * stripped — so a hard type error passed every assertion in the repo.
 */
it("fails on a type error when the directive line has trailing text", () => {
    expect(() => expectGeneratedCodeCompiles(withFile("// @ts-nocheck -- generated", TYPE_ERROR))).toThrow();
});

it("fails when no directive is present at all, rather than checking nothing", () => {
    // A header change that drops the directive must be loud: the suite would
    // otherwise keep passing while asserting less than it claims.
    expect(() => expectGeneratedCodeCompiles(withFile("// generated", "export const ok = 1;"))).toThrow(
        /no @ts-nocheck header found/,
    );
});
