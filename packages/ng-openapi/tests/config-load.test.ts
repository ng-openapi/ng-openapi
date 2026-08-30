import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative as relativePath } from "node:path";
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
    expect((error as ConfigLoadError).source).toBe(broken);
    expect((error as ConfigLoadError).cause).toBeDefined();
});

it("raises ConfigLoadError for a path that exists but cannot be required", async () => {
    // A directory: existsSync passes, require.resolve throws. That throw sat
    // outside the try and escaped as a bare Error with no `source`.
    const dir = tempDir();

    const error = await loadConfigFile(dir).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConfigLoadError);
    expect((error as ConfigLoadError).source).toBe(dir);
});

it("reports the resolved path, not the argument it was given", async () => {
    const dir = tempDir();
    const broken = join(dir, "broken.config.js");
    writeFileSync(broken, "module.exports = (((;");

    // Relative, so path.resolve is not the identity and the assertion can tell
    // the two apart — the earlier fixture passed an absolute path and could not.
    const relative = relativePath(process.cwd(), broken);
    expect(isAbsolute(relative)).toBe(false);

    const error = await loadConfigFile(relative).catch((reason: unknown) => reason);

    expect((error as ConfigLoadError).source).toBe(broken);
    expect((error as ConfigLoadError).source).not.toBe(relative);
});
