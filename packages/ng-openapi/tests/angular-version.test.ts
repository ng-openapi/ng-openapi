import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectAngularCoreVersion } from "../src/lib/core/angular-version";

// Outside the repo: node's resolution walks up parent directories, so a
// directory inside the workspace would always find the repo's own
// node_modules/@angular/core.
const tmpRoot = join(tmpdir(), "ng-openapi-angular-version-test");

function fakeWorkspace(name: string, angularVersion?: string): string {
    const workspace = join(tmpRoot, name);
    if (angularVersion !== undefined) {
        const pkgDir = join(workspace, "node_modules", "@angular", "core");
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "@angular/core", version: angularVersion }));
    } else {
        mkdirSync(workspace, { recursive: true });
    }
    return workspace;
}

afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
});

describe("detectAngularCoreVersion", () => {
    it("reads the installed @angular/core version", () => {
        expect(detectAngularCoreVersion(fakeWorkspace("v21", "21.3.0"))).toBe("21.3.0");
    });

    it("returns pre-release versions verbatim", () => {
        expect(detectAngularCoreVersion(fakeWorkspace("v22-next", "22.0.0-next.3"))).toBe("22.0.0-next.3");
    });

    it("returns undefined when @angular/core is not resolvable", () => {
        expect(detectAngularCoreVersion(fakeWorkspace("no-angular"))).toBeUndefined();
    });

    it("detects a version in this repo's workspace by default", () => {
        expect(detectAngularCoreVersion()).toMatch(/^\d+\./);
    });
});
