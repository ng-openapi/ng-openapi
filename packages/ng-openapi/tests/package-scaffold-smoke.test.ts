import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ngPackagr } from "ng-packagr";
import { afterAll, describe, expect, it } from "vitest";
import { generateFromConfig } from "ng-openapi";

const FIXTURE = resolve(__dirname, "../../testing/fixtures/specs/openapi-3.0.json");

// The one test that proves the scaffold does what it claims: the emitted
// package.json/ng-package.json/tsconfig.json drive a real ng-packagr build of
// the generated sources. Golden snapshots lock the files' content; only a
// build shows the content is *right*.
//
// Lives under the repo's tmp/ (not the OS temp dir) on purpose: ng-packagr
// resolves @angular/compiler-cli, @angular/core, rxjs and tslib by walking up
// from the project directory, so the workspace's own node_modules serves as
// the package's install — no `npm install`, no network.
describe("package scaffold — ng-packagr build", () => {
    const outputDir = join(process.cwd(), "tmp", "ng-openapi-tests", "npm-package-smoke");

    afterAll(() => {
        rmSync(outputDir, { recursive: true, force: true });
    });

    it("builds the generated output into an Angular Package Format library", async () => {
        rmSync(outputDir, { recursive: true, force: true });
        mkdirSync(outputDir, { recursive: true });

        const result = await generateFromConfig({
            input: FIXTURE,
            output: outputDir,
            clientName: "Orders",
            options: { dateType: "Date", enumStyle: "enum", generateServices: true },
            package: { name: "@smoke/orders-client" },
        });
        expect(result.warnings).toEqual([]);

        await ngPackagr()
            .forProject(join(outputDir, "ng-package.json"))
            .withTsConfig(join(outputDir, "tsconfig.json"))
            .build();

        const dist = join(outputDir, "dist");
        const manifest = JSON.parse(readFileSync(join(dist, "package.json"), "utf8")) as Record<string, unknown>;
        expect(manifest["name"]).toBe("@smoke/orders-client");
        expect(manifest["peerDependencies"]).toEqual({
            "@angular/common": expect.stringMatching(/^\^\d+\.0\.0$/),
            "@angular/core": expect.stringMatching(/^\^\d+\.0\.0$/),
            rxjs: "^7.4.0",
        });
        // ng-packagr strips devDependencies and scripts from the published manifest
        expect(manifest).not.toHaveProperty("devDependencies");

        // The FESM bundle and its typings, named after the package
        expect(existsSync(join(dist, "fesm2022", "smoke-orders-client.mjs"))).toBe(true);
        const typings = readFileSync(join(dist, "types", "smoke-orders-client.d.ts"), "utf8");
        expect(typings).toContain("provideOrdersClient");
        expect(typings).toContain("class OrdersService");
        // The README travels with the package
        expect(readFileSync(join(dist, "README.md"), "utf8")).toContain("provideOrdersClient");
    }, 180_000);
});
