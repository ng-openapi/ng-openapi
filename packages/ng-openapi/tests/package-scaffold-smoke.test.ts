import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ngPackagr } from "ng-packagr";
import { afterAll, describe, expect, it } from "vitest";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";

const FIXTURE = resolve(__dirname, "../../testing/fixtures/specs/openapi-3.0.json");

// The tests that prove the scaffold does what it claims: the emitted
// package.json/ng-package.json/tsconfig.json drive a real ng-packagr build of
// the generated sources. Golden snapshots lock the files' content; only a
// build shows the content is *right*.
//
// Lives under the repo's tmp/ (not the OS temp dir) on purpose: ng-packagr
// resolves @angular/compiler-cli, @angular/core, rxjs and tslib by walking up
// from the project directory, so the workspace's own node_modules serves as
// the package's install — no `npm install`, no network.
describe("package scaffold — ng-packagr build", () => {
    const root = join(process.cwd(), "tmp", "ng-openapi-tests", "npm-package-smoke");

    afterAll(() => {
        rmSync(root, { recursive: true, force: true });
    });

    async function generateAndBuild(name: string, config: Omit<GeneratorConfig, "input" | "output">) {
        const outputDir = join(root, name);
        rmSync(outputDir, { recursive: true, force: true });
        mkdirSync(outputDir, { recursive: true });

        const result = await generateFromConfig({ ...config, input: FIXTURE, output: outputDir });
        expect(result.warnings).toEqual([]);

        await ngPackagr()
            .forProject(join(outputDir, "ng-package.json"))
            .withTsConfig(join(outputDir, "tsconfig.json"))
            .build();

        const dist = join(outputDir, "dist");
        const manifest = JSON.parse(readFileSync(join(dist, "package.json"), "utf8")) as Record<string, unknown>;
        return { dist, manifest };
    }

    it("builds the generated client into an Angular Package Format library", async () => {
        const { dist, manifest } = await generateAndBuild("client", {
            clientName: "Orders",
            options: { dateType: "Date", enumStyle: "enum", generateServices: true },
            package: { name: "@smoke/orders-client" },
        });

        expect(manifest["name"]).toBe("@smoke/orders-client");
        // From the fixture's info.version, via the IR
        expect(manifest["version"]).toBe("1.0.0");
        expect(manifest["peerDependencies"]).toEqual({
            "@angular/common": expect.stringMatching(/^\^\d+\.0\.0$/),
            "@angular/core": expect.stringMatching(/^\^\d+\.0\.0$/),
            rxjs: expect.any(String),
        });
        expect(manifest["dependencies"]).toEqual({ tslib: expect.any(String) });
        // ng-packagr strips devDependencies and scripts from the published manifest
        expect(manifest).not.toHaveProperty("devDependencies");
        expect(manifest).not.toHaveProperty("scripts");

        // The FESM bundle and its typings, named after the package
        expect(existsSync(join(dist, "fesm2022", "smoke-orders-client.mjs"))).toBe(true);
        const typings = readFileSync(join(dist, "types", "smoke-orders-client.d.ts"), "utf8");
        expect(typings).toContain("provideOrdersClient");
        expect(typings).toContain("class OrdersService");
        // The README travels with the package
        expect(readFileSync(join(dist, "README.md"), "utf8")).toContain("provideOrdersClient");
    }, 180_000);

    it("builds a types-only package (models import only @angular/common, for HttpContext)", async () => {
        const { dist, manifest } = await generateAndBuild("types-only", {
            options: { dateType: "string", enumStyle: "union", generateServices: false },
            package: { name: "@smoke/orders-models" },
        });

        expect(manifest["peerDependencies"]).toEqual({ "@angular/common": expect.stringMatching(/^\^\d+\.0\.0$/) });
        const typings = readFileSync(join(dist, "types", "smoke-orders-models.d.ts"), "utf8");
        expect(typings).not.toContain("provide");
        expect(readFileSync(join(dist, "README.md"), "utf8")).toContain("model types only");
    }, 180_000);
});
