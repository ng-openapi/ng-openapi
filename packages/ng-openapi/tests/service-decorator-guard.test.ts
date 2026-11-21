import { afterAll, describe, expect, it, vi } from "vitest";
import { createOutputDirs, fixturePath } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";

/**
 * The soft guard for `serviceDecorator: "service"`: `@Service()` exists from
 * Angular 22, so generating it in a workspace with an older `@angular/core`
 * warns — and never blocks, since the workspace that runs the CLI is not
 * always the one that compiles the output.
 */

// Pinned rather than read from this repo's node_modules: the guard depends on
// it, and a test that followed the installed Angular would stop testing the
// boundary the day the repo upgrades.
const workspace = vi.hoisted(() => ({ angularVersion: undefined as string | undefined }));
vi.mock("../src/lib/core/angular-version", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/lib/core/angular-version")>()),
    detectAngularCoreVersion: () => workspace.angularVersion,
}));

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

async function warningsAboutService(
    angularVersion: string | undefined,
    serviceDecorator: "service" | "injectable" = "service",
) {
    workspace.angularVersion = angularVersion;
    const result = await generateFromConfig({
        input: fixturePath("openapi-3.1"),
        output: outputDirs.create("service-guard-"),
        options: { dateType: "string", enumStyle: "union", generateServices: true, serviceDecorator },
    });
    expect(result.filesWritten.length, "generation was blocked").toBeGreaterThan(0);
    return result.warnings.filter((warning) => warning.includes("@Service()"));
}

describe('serviceDecorator: "service" on an Angular without @Service()', () => {
    it.each(["21.2.13", "15.2.10"])("warns on Angular %s, naming the version found", async (angularVersion) => {
        expect(await warningsAboutService(angularVersion)).toEqual([
            `serviceDecorator "service" emits @Service(), which requires Angular 22+ — ` +
                `found @angular/core ${angularVersion} in this workspace. ` +
                `Generated services will not compile there.`,
        ]);
    });

    // 22.0.0 is the boundary itself; 22.2.7 would warn if the minimum were
    // ever mistaken for the QUERY method's 22.3.
    it.each(["22.0.0", "22.0.0-next.3", "22.2.7", "23.1.0"])(
        "has nothing to say on Angular %s",
        async (angularVersion) => {
            expect(await warningsAboutService(angularVersion)).toEqual([]);
        },
    );

    it("stays silent when no Angular can be detected in the workspace", async () => {
        expect(await warningsAboutService(undefined)).toEqual([]);
    });

    it("stays silent for the default decorator, however old the Angular", async () => {
        expect(await warningsAboutService("15.2.10", "injectable")).toEqual([]);
    });
});
