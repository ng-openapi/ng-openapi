import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { GeneratorConfig, SwaggerParser } from "../src";

const config: GeneratorConfig = {
    input: "spec.json",
    output: "out",
    options: { dateType: "string", enumStyle: "union" },
};

const v3Spec = {
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: { "/pets": { get: { responses: {} } } },
    components: { schemas: { Pet: { type: "object", properties: { name: { type: "string" } } } } },
};

const v2Spec = {
    swagger: "2.0",
    info: { title: "t", version: "1" },
    paths: {},
    definitions: { Pet: { type: "object", properties: { name: { type: "string" } } } },
};

const tempDir = mkdtempSync(join(tmpdir(), "ng-openapi-parser-"));
const writeTemp = (name: string, content: string): string => {
    const filePath = join(tempDir, name);
    writeFileSync(filePath, content, "utf8");
    return filePath;
};

afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("SwaggerParser.create from files", () => {
    it("parses a .json file", async () => {
        const parser = await SwaggerParser.create(writeTemp("spec.json", JSON.stringify(v3Spec)), config);
        expect(parser.getAllDefinitionNames()).toEqual(["Pet"]);
    });

    it("parses a .yaml file", async () => {
        const yaml = ["swagger: '2.0'", "info: { title: t, version: '1' }", "paths: {}", "definitions:", "  Pet:", "    type: object"].join("\n");
        const parser = await SwaggerParser.create(writeTemp("spec.yaml", yaml), config);
        expect(parser.getAllDefinitionNames()).toEqual(["Pet"]);
    });

    it("auto-detects JSON content behind an unknown extension", async () => {
        const parser = await SwaggerParser.create(writeTemp("spec.txt", JSON.stringify(v3Spec)), config);
        expect(parser.isValidSpec()).toBe(true);
    });

    it("auto-detects YAML content behind an unknown extension", async () => {
        const parser = await SwaggerParser.create(writeTemp("spec2.txt", "openapi: 3.0.0\ninfo: {}\npaths: {}"), config);
        expect(parser.getSpecVersion()).toEqual({ type: "openapi", version: "3.0.0" });
    });

    it("throws a helpful error on unparseable content", async () => {
        await expect(SwaggerParser.create(writeTemp("broken.json", "{ not json"), config)).rejects.toThrow(
            /Failed to parse JSON content/,
        );
    });

    it("throws when the config's validateInput rejects the spec", async () => {
        const rejectingConfig: GeneratorConfig = { ...config, validateInput: () => false };
        await expect(
            SwaggerParser.create(writeTemp("spec3.json", JSON.stringify(v3Spec)), rejectingConfig),
        ).rejects.toThrow(/validateInput/);
    });

    it("accepts the spec when validateInput approves it", async () => {
        const acceptingConfig: GeneratorConfig = { ...config, validateInput: (spec) => !!spec.openapi };
        const parser = await SwaggerParser.create(writeTemp("spec4.json", JSON.stringify(v3Spec)), acceptingConfig);
        expect(parser.isValidSpec()).toBe(true);
    });
});

describe("SwaggerParser.create from URLs", () => {
    const stubFetch = (impl: (url: string) => Promise<Response>) => {
        vi.stubGlobal("fetch", vi.fn(impl));
    };

    it("fetches and parses a JSON URL", async () => {
        stubFetch(async () => new Response(JSON.stringify(v3Spec), { status: 200 }));
        const parser = await SwaggerParser.create("https://example.com/spec.json", config);
        expect(parser.getAllDefinitionNames()).toEqual(["Pet"]);
    });

    it("parses YAML from a .yaml URL", async () => {
        stubFetch(async () => new Response("swagger: '2.0'\npaths: {}\ndefinitions: {}", { status: 200 }));
        const parser = await SwaggerParser.create("https://example.com/spec.yaml", config);
        expect(parser.getSpecVersion()).toEqual({ type: "swagger", version: "2.0" });
    });

    it("throws with the status code on HTTP errors", async () => {
        stubFetch(async () => new Response("nope", { status: 404, statusText: "Not Found" }));
        await expect(SwaggerParser.create("https://example.com/spec.json", config)).rejects.toThrow(/HTTP 404/);
    });

    it("throws on an empty response body", async () => {
        stubFetch(async () => new Response("   ", { status: 200 }));
        await expect(SwaggerParser.create("https://example.com/spec.json", config)).rejects.toThrow(
            /Empty response/,
        );
    });
});

describe("spec access", () => {
    const load = async (spec: object) => SwaggerParser.create(writeTemp("access.json", JSON.stringify(spec)), config);

    it("reads definitions from Swagger 2.0", async () => {
        const parser = await load(v2Spec);
        expect(Object.keys(parser.getDefinitions())).toEqual(["Pet"]);
        expect(parser.getDefinition("Pet")).toBeDefined();
        expect(parser.getDefinition("Missing")).toBeUndefined();
    });

    it("reads components.schemas from OpenAPI 3.0", async () => {
        const parser = await load(v3Spec);
        expect(Object.keys(parser.getDefinitions())).toEqual(["Pet"]);
    });

    it("returns an empty object when neither style is present", async () => {
        const parser = await load({ openapi: "3.0.0", info: {}, paths: {} });
        expect(parser.getDefinitions()).toEqual({});
    });

    it("resolves $refs in both 2.0 and 3.0 styles", async () => {
        const parser = await load(v3Spec);
        expect(parser.resolveReference("#/components/schemas/Pet")).toBeDefined();
        expect(parser.resolveReference("#/definitions/Pet")).toBeDefined();
        expect(parser.resolveReference("#/components/schemas/Missing")).toBeUndefined();
    });

    it("reports spec validity and version", async () => {
        expect((await load(v2Spec)).isValidSpec()).toBe(true);
        expect((await load(v3Spec)).isValidSpec()).toBe(true);
        expect((await load(v2Spec)).getSpecVersion()).toEqual({ type: "swagger", version: "2.0" });
        expect((await load(v3Spec)).getSpecVersion()).toEqual({ type: "openapi", version: "3.0.3" });
        expect((await load({ info: {}, paths: {} })).isValidSpec()).toBe(false);
        expect((await load({ info: {}, paths: {} })).getSpecVersion()).toBeNull();
    });

    it("returns paths or an empty object", async () => {
        expect(Object.keys((await load(v3Spec)).getPaths())).toEqual(["/pets"]);
        expect((await load({ openapi: "3.0.0", info: {} })).getPaths()).toEqual({});
    });
});
