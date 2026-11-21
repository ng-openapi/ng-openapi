import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { NormalizedOperation } from "@ng-openapi/shared";
import {
    describeQueryMethodSupport,
    detectAngularCoreVersion,
    isAngularVersionBelow,
} from "../src/lib/core/angular-version";

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

describe("isAngularVersionBelow", () => {
    const minimum = { major: 22, minor: 3 };

    it.each(["15.2.10", "21.2.13", "22.0.0", "22.2.7", "22.2.0-rc.0"])("%s is below 22.3", (version) => {
        expect(isAngularVersionBelow(version, minimum)).toBe(true);
    });

    it.each(["22.3.0", "22.3.4", "22.10.0", "23.0.0", "100.0.0"])("%s is not below 22.3", (version) => {
        expect(isAngularVersionBelow(version, minimum)).toBe(false);
    });

    it("counts a prerelease as the release it leads up to", () => {
        expect(isAngularVersionBelow("22.3.0-rc.0", minimum)).toBe(false);
        expect(isAngularVersionBelow("22.3.0-next.0", minimum)).toBe(false);
    });

    it("never calls a version it cannot read too old", () => {
        expect(isAngularVersionBelow("", minimum)).toBe(false);
        expect(isAngularVersionBelow("latest", minimum)).toBe(false);
        expect(isAngularVersionBelow("22", minimum)).toBe(false);
    });
});

describe("describeQueryMethodSupport", () => {
    const operation = (method: string, path: string, operationId?: string) =>
        ({ method, path, operationId }) as NormalizedOperation;
    const search = operation("QUERY", "/products/search", "searchProducts");
    const related = operation("QUERY", "/products/{id}/related");
    const list = operation("GET", "/products", "listProducts");

    it("says what an older HttpClient does with a QUERY request, naming the operation and the version", () => {
        expect(describeQueryMethodSupport({ operations: [list, search] }, "21.2.13")).toBe(
            "Operation searchProducts ((QUERY) /products/search) uses the HTTP QUERY method, which Angular's " +
                "HttpClient supports from 22.3 — found @angular/core 21.2.13 in this workspace. The generated " +
                "code still compiles and sends the request there, but HttpClient treats it as a mutation: it " +
                "attaches the XSRF token to it, and server-side rendering does not reuse its response during " +
                "hydration.",
        );
    });

    it("counts the operations instead of listing them all", () => {
        const warning = describeQueryMethodSupport({ operations: [related, list, search] }, "22.2.7");
        expect(warning).toContain("2 operations (the first is (QUERY) /products/{id}/related) use the HTTP QUERY");
    });

    it("has nothing to say from Angular 22.3 on", () => {
        expect(describeQueryMethodSupport({ operations: [search] }, "22.3.0")).toBeUndefined();
        expect(describeQueryMethodSupport({ operations: [search] }, "23.1.0")).toBeUndefined();
    });

    it("has nothing to say about a spec without QUERY operations", () => {
        expect(describeQueryMethodSupport({ operations: [list] }, "21.2.13")).toBeUndefined();
        expect(describeQueryMethodSupport({ operations: [] }, "21.2.13")).toBeUndefined();
    });

    it("stays silent when the workspace's Angular could not be detected", () => {
        expect(describeQueryMethodSupport({ operations: [search] }, undefined)).toBeUndefined();
    });
});
