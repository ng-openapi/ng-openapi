import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { ConfigLoadError, loadConfigFile, NgOpenApiError } from "ng-openapi";

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

const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpRoot, "cfg-"));
    dirs.push(dir);
    return dir;
};

it("raises ConfigLoadError for a missing config file", async () => {
    // The canonical config-load failure, and the last one still throwing a
    // bare Error. Hosts branch on the class, so this is an API contract.
    const missing = join(tempDir(), "nope.config.ts");

    await expect(loadConfigFile(missing)).rejects.toBeInstanceOf(ConfigLoadError);
    await expect(loadConfigFile(missing)).rejects.toBeInstanceOf(NgOpenApiError);
});

it("reports the resolved path and keeps the cause for an unloadable config", async () => {
    const dir = tempDir();
    const broken = join(dir, "broken.config.js");
    writeFileSync(broken, "module.exports = (((;");

    const error = await loadConfigFile(broken).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConfigLoadError);
    // Both throw sites report the resolved path, not the raw argument.
    expect((error as ConfigLoadError).source).toBe(broken);
    expect((error as ConfigLoadError).cause).toBeDefined();
});
