import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";

/**
 * Golden-file suite: generates code from the checked-in spec fixtures and
 * compares every generated file against a committed snapshot. Structural
 * refactors must keep these snapshots byte-identical; intentional output
 * changes show up as reviewable .ts diffs under __golden__/.
 */

export const GOLDEN_FIXTURES = ["swagger-2.0", "openapi-3.0", "openapi-3.1", "edge-cases"] as const;
export type GoldenFixture = (typeof GOLDEN_FIXTURES)[number];

type ConfigBuilder = (input: string, output: string) => GeneratorConfig;

export interface GoldenSuiteOptions {
    /**
     * Absolute path the snapshots are written to; pass
     * `fileURLToPath(new URL("./__golden__", import.meta.url))` from the test file
     * so each package owns its snapshots.
     */
    goldenDir: string;
    /** Variant name → config builder. Each variant runs against every fixture. */
    variants: Record<string, ConfigBuilder>;
    /** Restrict to a subset of fixtures (defaults to all). */
    fixtures?: readonly GoldenFixture[];
}

const FIXTURES_DIR = fileURLToPath(new URL("../fixtures/specs/", import.meta.url));

export function fixturePath(fixture: GoldenFixture): string {
    return join(FIXTURES_DIR, `${fixture}.json`);
}

function listFilesRecursively(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name));
}

/** Stable, cross-platform representation of a generated file's path and content. */
function normalizePath(path: string): string {
    return path.split(sep).join("/");
}

function normalizeContent(content: string): string {
    return content.replace(/\r\n/g, "\n");
}

export function registerGoldenSuite(suiteName: string, options: GoldenSuiteOptions): void {
    const fixtures = options.fixtures ?? GOLDEN_FIXTURES;

    // Outside node_modules: the generator resolves auto-imports through the
    // TypeScript language service, which ignores files under node_modules.
    const tmpRoot = join(process.cwd(), "tmp", "golden-tests");

    describe(suiteName, () => {
        for (const fixture of fixtures) {
            for (const [variant, buildConfig] of Object.entries(options.variants)) {
                it(`${fixture} × ${variant}`, async () => {
                    const outputDir = join(tmpRoot, suiteName.replace(/[^a-zA-Z0-9-]/g, "_"), fixture, variant);
                    rmSync(outputDir, { recursive: true, force: true });
                    mkdirSync(outputDir, { recursive: true });

                    await generateFromConfig(buildConfig(fixturePath(fixture), outputDir));

                    const files = listFilesRecursively(outputDir)
                        .map((file) => normalizePath(relative(outputDir, file)))
                        .sort();
                    expect(files.length, "generator produced no files").toBeGreaterThan(0);

                    const snapshotDir = resolve(options.goldenDir, fixture, variant);

                    // The manifest guards against files silently disappearing:
                    // per-file snapshots alone would not fail when a previously
                    // generated file is no longer emitted.
                    await expect(files.join("\n") + "\n").toMatchFileSnapshot(join(snapshotDir, "_manifest.txt"));

                    for (const file of files) {
                        const content = normalizeContent(readFileSync(join(outputDir, file), "utf8"));
                        await expect(content).toMatchFileSnapshot(join(snapshotDir, file + ".snap"));
                    }

                    rmSync(outputDir, { recursive: true, force: true });
                });
            }
        }
    });
}
