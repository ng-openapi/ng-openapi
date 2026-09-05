import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { expectNoDeclaration } from "../src";

/** What the generator emits once escaped: the payload never leaves the block. */
const COMMENTED = "/** ends *\\/ export const PWNED = 1; /* */\\nexport const ok = 1;\\n";

/**
 * This helper is the designated guard for injected code that *compiles* —
 * which the compile assertion cannot see by definition — so its breadth is
 * load-bearing. Routing through generation cannot observe that breadth: when
 * the escape works nothing is declared in any form, so a narrower filter passes
 * just as well. Tested directly instead.
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

const withSource = (source: string): string => {
    const dir = mkdtempSync(join(tmpRoot, "nodecl-"));
    dirs.push(dir);
    writeFileSync(join(dir, "generated.ts"), source);
    return dir;
};

describe("expectNoDeclaration", () => {
    const forms: [string, string][] = [
        ["const", "export const PWNED = 1;"],
        ["function", "export function PWNED() {}"],
        ["class", "export class PWNED {}"],
        ["interface", "export interface PWNED { a: string }"],
        ["enum", "export enum PWNED { A }"],
        ["type alias", "export type PWNED = string;"],
        ["namespace", "export namespace PWNED { export const x = 1; }"],
    ];

    for (const [kind, source] of forms) {
        it(`catches an injected ${kind} declaration`, () => {
            expect(() => expectNoDeclaration(withSource(source), "PWNED")).toThrow();
        });
    }

    it("passes when the name appears only inside a comment", () => {
        expect(() => expectNoDeclaration(withSource(COMMENTED), "PWNED")).not.toThrow();
    });

    it("fails loudly rather than silently when there is nothing to check", () => {
        const dir = mkdtempSync(join(tmpRoot, "nodecl-empty-"));
        dirs.push(dir);
        expect(() => expectNoDeclaration(dir, "PWNED")).toThrow(/no generated files/);
    });
});
