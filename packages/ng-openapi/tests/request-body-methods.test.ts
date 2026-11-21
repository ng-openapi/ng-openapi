import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles } from "@ng-openapi/testing";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";
import { ZodPlugin } from "@ng-openapi/zod";

/**
 * Regression coverage for #138: a DELETE operation with a request body got a
 * method that took the body, set `Content-Type` and sent nothing — only POST,
 * PUT and PATCH ever put `body` into the request. A declared body is now sent
 * with every method that can carry one; GET and HEAD, which no browser sends a
 * body with, lose it out loud instead of accepting and dropping it.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

const json = (ref: string) => ({ "application/json": { schema: { $ref: ref } } });
const form = (contentType: string, schema: object) => ({ required: true, content: { [contentType]: { schema } } });
const noContent = { "204": { description: "done" } };

const SPEC = {
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
        "/items": {
            // The issue's repro: an ASP.NET Core DELETE taking a JSON body.
            delete: {
                operationId: "deleteItems",
                tags: ["Items"],
                requestBody: { required: true, content: json("#/components/schemas/ItemDto") },
                responses: noContent,
            },
            post: {
                operationId: "createItem",
                tags: ["Items"],
                requestBody: { required: true, content: json("#/components/schemas/ItemDto") },
                responses: noContent,
            },
            options: {
                operationId: "describeItems",
                tags: ["Items"],
                requestBody: { content: json("#/components/schemas/ItemDto") },
                responses: noContent,
            },
        },
        "/items/{itemId}": {
            parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }],
            // Optional body between a path and a query parameter.
            delete: {
                operationId: "deleteItem",
                tags: ["Items"],
                parameters: [{ name: "force", in: "query", schema: { type: "boolean" } }],
                requestBody: { content: json("#/components/schemas/ItemDto") },
                responses: noContent,
            },
        },
        "/items/{itemId}/plain": {
            parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }],
            // No body declared: nothing to send, and DELETE gets no `body: null`.
            delete: { operationId: "deleteItemPlain", tags: ["Items"], responses: noContent },
            post: { operationId: "touchItem", tags: ["Items"], responses: noContent },
        },
        "/items/form": {
            delete: {
                operationId: "deleteItemsByForm",
                tags: ["Items"],
                requestBody: form("application/x-www-form-urlencoded", {
                    type: "object",
                    required: ["ids"],
                    properties: { ids: { type: "array", items: { type: "string" } } },
                }),
                responses: noContent,
            },
        },
        "/items/files": {
            delete: {
                operationId: "deleteItemsByFile",
                tags: ["Items"],
                requestBody: form("multipart/form-data", {
                    type: "object",
                    required: ["manifest"],
                    properties: { manifest: { type: "string", format: "binary" } },
                }),
                responses: noContent,
            },
        },
    },
    components: {
        schemas: {
            ItemDto: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
    },
};

/**
 * SPEC plus form bodies whose schema lists no top-level `properties`: a bare
 * object, DTO inheritance through `allOf`, and `additionalProperties`.
 */
const FIELDLESS_FORM_SPEC = {
    ...SPEC,
    paths: {
        ...SPEC.paths,
        "/items/empty-form": {
            delete: {
                operationId: "deleteItemsByEmptyForm",
                tags: ["Items"],
                requestBody: form("application/x-www-form-urlencoded", { type: "object" }),
                responses: noContent,
            },
        },
        "/items/avatar": {
            post: {
                operationId: "uploadItemAvatar",
                tags: ["Items"],
                requestBody: form("multipart/form-data", { allOf: [{ $ref: "#/components/schemas/AvatarUpload" }] }),
                responses: noContent,
            },
        },
        "/items/tags": {
            put: {
                operationId: "replaceItemTags",
                tags: ["Items"],
                requestBody: form("application/x-www-form-urlencoded", {
                    type: "object",
                    additionalProperties: { type: "string" },
                }),
                responses: noContent,
            },
        },
    },
    components: {
        schemas: {
            ...SPEC.components.schemas,
            AvatarUpload: { type: "object", properties: { file: { type: "string", format: "binary" } } },
        },
    },
};

function writeSpec(dir: string, spec: unknown): string {
    const input = join(dir, "spec.json");
    writeFileSync(input, JSON.stringify(spec));
    return input;
}

function read(output: string, ...path: string[]): string {
    return readFileSync(join(output, ...path), "utf8");
}

/** The implementation of one generated method: from its last signature to its closing brace. */
function methodSource(service: string, name: string): string {
    const start = service.lastIndexOf(`    ${name}(`);
    expect(start, `method ${name} was not generated`).toBeGreaterThan(-1);
    return service.slice(start, service.indexOf("\n    }\n", start));
}

/** The expression a generated method passes as `body` to `request()`, if any. */
function sentBody(method: string): string | undefined {
    return /\.request\('\w+', url, \{\s+body: ([^,\n]+),/.exec(method)?.[1];
}

async function generate(
    prefix: string,
    {
        options = {},
        plugins = [],
        spec = SPEC,
    }: Partial<Pick<GeneratorConfig, "plugins">> & {
        options?: Partial<GeneratorConfig["options"]>;
        spec?: unknown;
    } = {},
) {
    const output = outputDirs.create(prefix);
    const result = await generateFromConfig({
        input: writeSpec(output, spec),
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: true, ...options },
        plugins,
    });
    return { output, result, service: read(output, "services", "items.service.ts") };
}

describe("request bodies on methods other than POST/PUT/PATCH (#138)", () => {
    it("sends the body a DELETE or OPTIONS operation declares", async () => {
        const { output, result, service } = await generate("body-methods-", { plugins: [ZodPlugin] });
        expect(result.warnings).toEqual([]);

        const deleteItems = methodSource(service, "deleteItems");
        expect(deleteItems).toMatch(/^ {4}deleteItems\(itemDto: ItemDto, observe\?:/);
        expect(deleteItems).toContain("headers = headers.set('Content-Type', 'application/json');");
        expect(deleteItems).toContain("request('delete', url, {");
        expect(sentBody(deleteItems)).toBe("itemDto");

        // Optional: an omitted body reaches HttpClient as `undefined`, which
        // it sends as no body at all — what a caller passing none got before.
        const deleteItem = methodSource(service, "deleteItem");
        expect(deleteItem).toMatch(/^ {4}deleteItem\(itemId: string, itemDto\?: ItemDto, force\?: boolean, observe\?:/);
        expect(sentBody(deleteItem)).toBe("itemDto");

        const describeItems = methodSource(service, "describeItems");
        expect(describeItems).toContain("request('options', url, {");
        expect(sentBody(describeItems)).toBe("itemDto");

        const byForm = methodSource(service, "deleteItemsByForm");
        expect(byForm).toContain("const formBody = new URLSearchParams();");
        expect(sentBody(byForm)).toBe("formBody.toString()");

        const byFile = methodSource(service, "deleteItemsByFile");
        expect(byFile).toContain("const formData = new FormData();");
        expect(sentBody(byFile)).toBe("formData");

        // The validator of a DELETE body was always generated; it now
        // describes something the client sends.
        expect(read(output, "validators", "items.validator.ts")).toContain("export const deleteItemsBody =");

        // Strict compile: an undeclared `formData`/`formBody` would fail here.
        expectGeneratedCodeCompiles(output);
    });

    it("sends nothing where there is nothing to send, and keeps `body: null` on POST", async () => {
        const { service } = await generate("body-methods-empty-");

        const deletePlain = methodSource(service, "deleteItemPlain");
        expect(deletePlain).not.toContain("body:");
        expect(deletePlain).not.toContain("Content-Type");
        expect(sentBody(methodSource(service, "touchItem"))).toBe("null");
        expect(sentBody(methodSource(service, "createItem"))).toBe("itemDto");
    });

    // A form whose schema lists no top-level `properties` has no
    // `formData`/`formBody` to send. The method silently takes nothing for the
    // body, so the run has to say so.
    it("warns about a form body it cannot list the fields of, and sends none", async () => {
        const { output, result, service } = await generate("body-methods-fieldless-", { spec: FIELDLESS_FORM_SPEC });

        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(result.warnings).toHaveLength(3);
        const warningAbout = (operation: string) => result.warnings.find((warning) => warning.includes(operation));
        expect(warningAbout("deleteItemsByEmptyForm ((DELETE) /items/empty-form)")).toContain(
            "The application/x-www-form-urlencoded request body of",
        );
        expect(warningAbout("uploadItemAvatar ((POST) /items/avatar)")).toContain(
            "The multipart/form-data request body of",
        );
        expect(warningAbout("replaceItemTags ((PUT) /items/tags)")).toContain("has no fields to generate");

        const deleteByEmptyForm = methodSource(service, "deleteItemsByEmptyForm");
        expect(deleteByEmptyForm).not.toContain("formBody");
        expect(deleteByEmptyForm).not.toContain("body:");

        // The file field sits under `allOf`: no argument for it, nothing sent.
        const uploadAvatar = methodSource(service, "uploadItemAvatar");
        expect(uploadAvatar).toMatch(/^ {4}uploadItemAvatar\(observe\?:/);
        expect(uploadAvatar).not.toContain("formData");
        expect(sentBody(uploadAvatar)).toBe("null");

        const replaceTags = methodSource(service, "replaceItemTags");
        expect(replaceTags).toMatch(/^ {4}replaceItemTags\(observe\?:/);
        expect(replaceTags).toContain("headers.set('Content-Type', 'application/x-www-form-urlencoded')");
        expect(sentBody(replaceTags)).toBe("null");

        expectGeneratedCodeCompiles(output);
    });

    // The options that reshape how the body is bound or how the request
    // statement is emitted. Under each, the identifier the body argument is
    // bound to and the expression that is sent must still be the same name.
    it.each<[string, Partial<GeneratorConfig["options"]>, string, RegExp]>([
        ["useSingleRequestParameter", { useSingleRequestParameter: true }, "itemDto", /const \{ itemDto \} = request;/],
        [
            "naming.models",
            { naming: { models: { suffix: "Model" } } },
            "itemDtoModel",
            /deleteItems\(itemDtoModel: ItemDtoModel,/,
        ],
        ["validation.response", { validation: { response: true } }, "itemDto", /options\?\.parse\?\.\(response\)/],
    ])("sends the DELETE body under %s", async (_name, options, body, binding) => {
        const { output, service } = await generate("body-methods-option-", { options });

        const deleteItems = methodSource(service, "deleteItems");
        expect(deleteItems).toMatch(binding);
        expect(sentBody(deleteItems)).toBe(body);

        expectGeneratedCodeCompiles(output);
    });

    it("leaves a GET or HEAD body out of the service and the validators, with a warning", async () => {
        const { output, result, service } = await generate("body-methods-get-", {
            plugins: [ZodPlugin],
            spec: {
                ...SPEC,
                paths: {
                    "/items/search": {
                        get: {
                            operationId: "searchItems",
                            tags: ["Items"],
                            parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }],
                            requestBody: { required: true, content: json("#/components/schemas/ItemDto") },
                            responses: { "200": { description: "ok", content: json("#/components/schemas/ItemDto") } },
                        },
                        head: {
                            operationId: "probeItems",
                            tags: ["Items"],
                            requestBody: { content: json("#/components/schemas/ItemDto") },
                            responses: noContent,
                        },
                    },
                },
            },
        });

        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(result.warnings).toHaveLength(2);
        expect(result.warnings[0]).toContain("The request body of searchItems ((GET) /items/search) was skipped");
        expect(result.warnings[1]).toContain("The request body of probeItems ((HEAD) /items/search) was skipped");

        const searchItems = methodSource(service, "searchItems");
        expect(searchItems).toMatch(/^ {4}searchItems\(limit\?: number, observe\?:/);
        expect(searchItems).not.toContain("body:");
        expect(searchItems).not.toContain("Content-Type");
        expect(methodSource(service, "probeItems")).toMatch(/^ {4}probeItems\(observe\?:/);

        const validators = read(output, "validators", "items.validator.ts");
        expect(validators).toContain("export const searchItems200Response =");
        expect(validators).not.toContain("searchItemsBody");

        expectGeneratedCodeCompiles(output);
    });
});
