import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { generateFromConfig, GenerationPhase, GeneratorConfig, SpecLoadError, SpecParseError } from "ng-openapi";

const FIXTURE = resolve(__dirname, "../../testing/fixtures/specs/openapi-3.0.json");

const tmpRoot = join(process.cwd(), "tmp", "ng-openapi-tests");
mkdirSync(tmpRoot, { recursive: true });
const tempDirs: string[] = [];

afterAll(() => {
    for (const dir of tempDirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            // best-effort cleanup
        }
    }
});

afterEach(() => {
    vi.restoreAllMocks();
});

const buildConfig = (output: string): GeneratorConfig => ({
    input: FIXTURE,
    output,
    clientName: "PetsApi",
    options: { dateType: "Date", enumStyle: "enum" },
});

describe("generateFromConfig typed errors", () => {
    it("throws SpecLoadError for a missing input file", async () => {
        const output = mkdtempSync(join(tmpRoot, "err-load-"));
        tempDirs.push(output);

        await expect(
            generateFromConfig({ ...buildConfig(output), input: join(output, "missing.json") }),
        ).rejects.toBeInstanceOf(SpecLoadError);
    });

    it("throws SpecParseError for a spec without a supported version", async () => {
        const output = mkdtempSync(join(tmpRoot, "err-parse-"));
        tempDirs.push(output);
        const input = join(output, "not-a-spec.json");
        const { writeFileSync } = await import("node:fs");
        writeFileSync(input, JSON.stringify({ hello: "world" }));

        await expect(generateFromConfig({ ...buildConfig(output), input })).rejects.toBeInstanceOf(SpecParseError);
    });
});

describe("generateFromConfig result + reporter", () => {
    it("returns a structured result and stays silent on the console", async () => {
        const output = mkdtempSync(join(tmpRoot, "result-"));
        tempDirs.push(output);

        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        const result = await generateFromConfig(buildConfig(output));

        expect(log).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();

        expect(result.client).toBe("PetsApi");
        expect(result.warnings).toEqual([]);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.filesWritten.length).toBeGreaterThan(0);
        expect(result.filesWritten.some((file) => file.replace(/\\/g, "/").endsWith("models/index.ts"))).toBe(true);
    });

    it("reports phases in pipeline order", async () => {
        const output = mkdtempSync(join(tmpRoot, "phases-"));
        tempDirs.push(output);

        const phases: GenerationPhase[] = [];
        await generateFromConfig(buildConfig(output), { onPhase: (phase) => phases.push(phase) });

        expect(phases).toEqual(["processing-spec", "types-generated", "services-generated"]);
    });

    it("delivers warnings to the reporter and the result", async () => {
        const output = mkdtempSync(join(tmpRoot, "warn-"));
        tempDirs.push(output);

        const reported: string[] = [];
        const base = buildConfig(output);
        const config: GeneratorConfig = {
            ...base,
            input: resolve(__dirname, "fixtures-empty-spec.json"),
            // generateServices off: the service-index generator predates this
            // refactor in not tolerating path-less specs
            options: { ...base.options, generateServices: false },
        };

        // A spec with no paths/definitions triggers the warning channel
        const { writeFileSync } = await import("node:fs");
        writeFileSync(
            config.input,
            JSON.stringify({ openapi: "3.0.0", info: { title: "empty", version: "1" }, paths: {} }),
        );

        try {
            const result = await generateFromConfig(config, { onWarning: (message) => reported.push(message) });
            expect(reported).toContain("No definitions found in swagger file");
            expect(result.warnings).toEqual(reported);
        } finally {
            rmSync(config.input, { force: true });
        }
    });
});
