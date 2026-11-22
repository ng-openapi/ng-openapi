import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";
import { ZodPlugin } from "@ng-openapi/zod";

/**
 * Request bodies beyond exactly `application/json` and the two forms (#136):
 * JSON under another content key, text, and binary. Each is one argument,
 * sent as it is with the content type the spec declares. The golden suite
 * snapshots the same fixture; these tests say what about it matters, and that
 * it compiles.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

/** The expression a generated method passes as `body` to `request()`, if any. */
function sentBody(method: string): string | undefined {
    return /\.request\('\w+', url, \{\s+body: ([^,\n]+),/.exec(method)?.[1];
}

/** The Content-Type a generated method declares when the caller set none, if any. */
function declaredContentType(method: string): string | undefined {
    return /headers = headers\.set\('Content-Type', '([^']+)'\);/.exec(method)?.[1];
}

async function generate(prefix: string, config: Partial<GeneratorConfig> & { spec?: unknown } = {}) {
    const output = outputDirs.create(prefix);
    const { spec, ...rest } = config;
    let input = fixturePath("openapi-3.1");
    if (spec !== undefined) {
        input = join(output, "spec.json");
        writeFileSync(input, JSON.stringify(spec));
    }
    const result = await generateFromConfig({
        input,
        output,
        ...rest,
        options: { dateType: "string", enumStyle: "union", generateServices: true, ...rest.options },
    });
    const service = (name: string) => readFileSync(join(output, "services", `${name}.service.ts`), "utf8");
    return { output, result, service };
}

describe("request bodies under other content types (#136)", () => {
    it("binds a JSON body under a structured-syntax or parameterised content type", async () => {
        const { output, result, service } = await generate("body-types-json-", { plugins: [ZodPlugin] });
        const widgets = service("widgets");

        // Named and typed like any JSON body; declared as what the spec says it is.
        const patchWidget = methodSource(widgets, "patchWidget");
        expect(patchWidget).toMatch(/^ {4}patchWidget\(widgetId: string, widgetPatch: WidgetPatch, observe\?:/);
        expect(sentBody(patchWidget)).toBe("widgetPatch");
        expect(declaredContentType(patchWidget)).toBe("application/merge-patch+json");

        const importWidgets = methodSource(widgets, "importWidgets");
        expect(importWidgets).toMatch(/^ {4}importWidgets\(requestBody: Array<NewWidget>, observe\?:/);
        expect(sentBody(importWidgets)).toBe("requestBody");
        expect(declaredContentType(importWidgets)).toBe("application/json; charset=utf-8");

        // A JSON body is described by a schema, so the zod plugin validates it too.
        const validators = readFileSync(join(output, "validators", "widgets.validator.ts"), "utf8");
        expect(validators).toContain("export const patchWidgetBody =");
        expect(validators).toContain("export const importWidgetsBody =");

        expect(result.warnings).toEqual([]);
        expectGeneratedCodeCompiles(output);
    });

    it("binds a text body as a string", async () => {
        const { service } = await generate("body-types-text-");
        const replaceNotes = methodSource(service("widgets"), "replaceWidgetNotes");

        expect(replaceNotes).toMatch(/^ {4}replaceWidgetNotes\(widgetId: string, requestBody: string, observe\?:/);
        expect(sentBody(replaceNotes)).toBe("requestBody");
        expect(declaredContentType(replaceNotes)).toBe("text/plain; charset=utf-8");
    });

    it("binds a binary body as a Blob, and declares its type only when the spec leaves no choice", async () => {
        const { service } = await generate("body-types-binary-");
        const widgets = service("widgets");

        // One declared type: that is what the request says it carries.
        const uploadManual = methodSource(widgets, "uploadWidgetManual");
        expect(uploadManual).toMatch(/^ {4}uploadWidgetManual\(widgetId: string, requestBody\?: Blob, observe\?:/);
        expect(sentBody(uploadManual)).toBe("requestBody");
        expect(declaredContentType(uploadManual)).toBe("application/pdf");

        // PNG or JPEG: HttpClient sends the Blob's own type when none is set.
        const uploadImage = methodSource(widgets, "uploadWidgetImage");
        expect(uploadImage).toMatch(/^ {4}uploadWidgetImage\(widgetId: string, requestBody: Blob, observe\?:/);
        expect(sentBody(uploadImage)).toBe("requestBody");
        expect(uploadImage).not.toContain("Content-Type");
    });

    it("puts the body into the request object with useSingleRequestParameter", async () => {
        const { output, service } = await generate("body-types-single-param-", {
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                useSingleRequestParameter: true,
            },
        });
        const widgets = service("widgets");

        expect(readFileSync(join(output, "models", "request-params.ts"), "utf8")).toMatch(
            /export interface ReplaceWidgetNotesParams \{\s+widgetId: string;\s+requestBody: string;\s+\}/,
        );
        const replaceNotes = methodSource(widgets, "replaceWidgetNotes");
        expect(replaceNotes).toMatch(/^ {4}replaceWidgetNotes\(request: ReplaceWidgetNotesParams, observe\?:/);
        expect(sentBody(replaceNotes)).toBe("requestBody");

        expectGeneratedCodeCompiles(output);
    });
});

describe("a body declared several ways, or in no way a method can send", () => {
    const noContent = { "204": { description: "done" } };
    const binary = { schema: { type: "string", format: "binary" } };
    const spec = {
        openapi: "3.1.0",
        info: { title: "Bodies", version: "1.0.0" },
        paths: {
            // Exactly application/json is what was always bound, and still wins.
            "/notes": {
                post: {
                    operationId: "createNote",
                    tags: ["Notes"],
                    requestBody: {
                        required: true,
                        content: {
                            "text/plain": { schema: { type: "string" } },
                            "application/json": { schema: { $ref: "#/components/schemas/Note" } },
                        },
                    },
                    responses: noContent,
                },
            },
            // A range: any image, declared by the file that is uploaded.
            "/avatar": {
                put: {
                    operationId: "uploadAvatar",
                    tags: ["Notes"],
                    requestBody: { required: true, content: { "image/*": binary } },
                    responses: noContent,
                },
            },
            // XML is text: the caller serializes it.
            "/feed": {
                post: {
                    operationId: "publishFeed",
                    tags: ["Notes"],
                    requestBody: { required: true, content: { "application/xml": { schema: { type: "object" } } } },
                    responses: noContent,
                },
            },
            // A stream of items is not one value to pass.
            "/events": {
                post: {
                    operationId: "appendEvents",
                    tags: ["Notes"],
                    requestBody: {
                        required: true,
                        content: { "application/x-ndjson": { schema: { type: "string" } } },
                    },
                    responses: noContent,
                },
            },
        },
        components: { schemas: { Note: { type: "object", properties: { text: { type: "string" } } } } },
    };

    it("keeps binding exactly application/json first, and types the other bodies by how they are sent", async () => {
        const { output, service } = await generate("body-types-mixed-", { spec });
        const notes = service("notes");

        const createNote = methodSource(notes, "createNote");
        expect(createNote).toMatch(/^ {4}createNote\(note: Note, observe\?:/);
        expect(declaredContentType(createNote)).toBe("application/json");

        const uploadAvatar = methodSource(notes, "uploadAvatar");
        expect(uploadAvatar).toMatch(/^ {4}uploadAvatar\(requestBody: Blob, observe\?:/);
        expect(uploadAvatar).not.toContain("Content-Type");

        // The schema describes the document; what is sent is its text.
        const publishFeed = methodSource(notes, "publishFeed");
        expect(publishFeed).toMatch(/^ {4}publishFeed\(requestBody: string, observe\?:/);
        expect(declaredContentType(publishFeed)).toBe("application/xml");

        expectGeneratedCodeCompiles(output);
    });

    it("sends no body, and no Content-Type for one, where it cannot bind any — and says so", async () => {
        const { result, service } = await generate("body-types-unbound-", { spec });
        const appendEvents = methodSource(service("notes"), "appendEvents");

        expect(appendEvents).toMatch(/^ {4}appendEvents\(observe\?:/);
        // POST spells out the empty body, as it always has.
        expect(sentBody(appendEvents)).toBe("null");
        expect(appendEvents).not.toContain("Content-Type");
        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(result.warnings).toEqual([
            expect.stringContaining(
                "The request body of appendEvents ((POST) /events) is declared only as application/x-ndjson, which " +
                    "generated methods cannot send",
            ),
        ]);
    });
});

describe("forms under a parameterised content key, and the body a validator describes", () => {
    const noContent = { "204": { description: "done" } };
    const form = (properties: Record<string, object>) => ({ schema: { type: "object", properties } });
    const text = { type: "string" };
    const spec = {
        openapi: "3.1.0",
        info: { title: "Forms", version: "1.0.0" },
        paths: {
            "/token": {
                post: {
                    operationId: "createToken",
                    tags: ["Forms"],
                    requestBody: {
                        required: true,
                        content: {
                            "application/x-www-form-urlencoded; charset=UTF-8": form({ user: text, scope: text }),
                        },
                    },
                    responses: noContent,
                },
            },
            // Two descriptions of one body. The request carries the multipart one.
            "/documents": {
                post: {
                    operationId: "uploadDocument",
                    tags: ["Forms"],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": form({ jsonOnly: text }),
                            "multipart/form-data": form({ title: text }),
                        },
                    },
                    responses: noContent,
                },
            },
        },
    };

    it("takes one argument per field of a form whose content key carries a parameter", async () => {
        const { output, result, service } = await generate("body-types-form-params-", { spec });
        const createToken = methodSource(service("forms"), "createToken");

        // Not `requestBody: Blob`.
        expect(createToken).toMatch(/^ {4}createToken\(user\?: string, scope\?: string, observe\?:/);
        expect(createToken).toContain("formBody.append('user', String(user));");
        expect(sentBody(createToken)).toBe("formBody.toString()");
        expect(declaredContentType(createToken)).toBe("application/x-www-form-urlencoded; charset=UTF-8");

        // Bound, so there is nothing to say about the body.
        expect(result.warnings.filter((warning) => warning.includes("request body"))).toEqual([]);
        expectGeneratedCodeCompiles(output);
    });

    it("validates the body that is sent, not another one the operation also declares", async () => {
        const { output, service } = await generate("body-types-validator-", { spec, plugins: [ZodPlugin] });

        expect(sentBody(methodSource(service("forms"), "uploadDocument"))).toBe("formData");
        const validators = readFileSync(join(output, "validators", "forms.validator.ts"), "utf8");
        expect(validators).toMatch(/export const uploadDocumentBody = z\.object\(\{\s+"title":/);
        expect(validators).not.toContain("jsonOnly");
    });
});

describe("a content type that says little about the body, or says it misleadingly", () => {
    const noContent = { "204": { description: "done" } };
    const binary = { schema: { type: "string", format: "binary" } };
    const post = (operationId: string, content: object) => ({
        post: { operationId, tags: ["Uploads"], requestBody: { required: true, content }, responses: noContent },
    });
    const spec = {
        openapi: "3.0.3",
        info: { title: "Uploads", version: "1.0.0" },
        paths: {
            // swagger-core writes a JAX-RS body without @Consumes this way.
            "/items": post("createItem", { "*/*": { schema: { $ref: "#/components/schemas/Item" } } }),
            "/items/name": post("renameItem", { "*/*": { schema: { type: "string" } } }),
            "/items/file": post("attachFile", { "*/*": binary }),
            // "xml" is in the name of both. One is a zip archive, the other a file.
            "/sheets": post("importSheet", {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": binary,
            }),
            "/logos": post("uploadLogo", { "image/svg+xml": binary }),
            "/events": post("importCalendar", { "text/calendar": { schema: { type: "string" } } }),
            // The form's key carries a parameter, so it was never read: JSON is what was sent.
            "/documents": post("createDocument", {
                "application/json": { schema: { $ref: "#/components/schemas/Item" } },
                "multipart/form-data; charset=utf-8": {
                    schema: { type: "object", properties: { file: { type: "string", format: "binary" } } },
                },
            }),
            // Two different documents; the method takes the first.
            "/patches": post("patchItem", {
                "application/merge-patch+json": { schema: { $ref: "#/components/schemas/Item" } },
                "application/json-patch+json": { schema: { type: "array", items: { type: "object" } } },
            }),
            // A form whose fields are inherited: nothing to send field by field.
            "/inherited": post("uploadInherited", {
                "multipart/form-data": { schema: { allOf: [{ $ref: "#/components/schemas/Item" }] } },
            }),
        },
        components: { schemas: { Item: { type: "object", properties: { name: { type: "string" } } } } },
    };

    it("types a body under */* from its schema, and lets HttpClient say what it is", async () => {
        const { output, service } = await generate("body-types-any-", { spec, plugins: [ZodPlugin] });
        const uploads = service("uploads");

        const createItem = methodSource(uploads, "createItem");
        expect(createItem).toMatch(/^ {4}createItem\(item: Item, observe\?:/);
        expect(sentBody(createItem)).toBe("item");
        // Nothing to declare under a range: HttpClient sends application/json for a value.
        expect(createItem).not.toContain("Content-Type");
        expect(readFileSync(join(output, "validators", "uploads.validator.ts"), "utf8")).toContain(
            "export const createItemBody =",
        );

        expect(methodSource(uploads, "renameItem")).toMatch(/^ {4}renameItem\(requestBody: string, observe\?:/);
        expect(methodSource(uploads, "attachFile")).toMatch(/^ {4}attachFile\(requestBody: Blob, observe\?:/);

        expectGeneratedCodeCompiles(output);
    });

    it("takes a file where the content type is one, and a string where it is text", async () => {
        const { service } = await generate("body-types-names-", { spec });
        const uploads = service("uploads");

        const importSheet = methodSource(uploads, "importSheet");
        expect(importSheet).toMatch(/^ {4}importSheet\(requestBody: Blob, observe\?:/);
        expect(declaredContentType(importSheet)).toBe(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        expect(methodSource(uploads, "uploadLogo")).toMatch(/^ {4}uploadLogo\(requestBody: Blob, observe\?:/);

        const importCalendar = methodSource(uploads, "importCalendar");
        expect(importCalendar).toMatch(/^ {4}importCalendar\(requestBody: string, observe\?:/);
        expect(declaredContentType(importCalendar)).toBe("text/calendar");
    });

    it("keeps sending JSON next to a form whose key carries a parameter", async () => {
        const { service } = await generate("body-types-precedence-", { spec });
        const createDocument = methodSource(service("uploads"), "createDocument");

        expect(createDocument).toMatch(/^ {4}createDocument\(item: Item, observe\?:/);
        expect(sentBody(createDocument)).toBe("item");
        expect(declaredContentType(createDocument)).toBe("application/json");
        expect(createDocument).not.toContain("FormData");
    });

    it("says which of several JSON types it bound", async () => {
        const { result, service } = await generate("body-types-several-", { spec });
        const patchItem = methodSource(service("uploads"), "patchItem");

        expect(patchItem).toMatch(/^ {4}patchItem\(item: Item, observe\?:/);
        expect(declaredContentType(patchItem)).toBe("application/merge-patch+json");
        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(result.warnings.filter((warning) => warning.includes("patchItem"))).toEqual([
            expect.stringContaining(
                "is declared under several JSON content types: application/merge-patch+json, " +
                    "application/json-patch+json. Generated methods bind the first",
            ),
        ]);
    });

    it("still describes a form without fields to the zod plugin", async () => {
        const { output, service } = await generate("body-types-fieldless-", { spec, plugins: [ZodPlugin] });

        // No argument and no body: the form lists no field to send.
        expect(methodSource(service("uploads"), "uploadInherited")).toMatch(/^ {4}uploadInherited\(observe\?:/);
        // The schema is still the form's, as it was before bodies had kinds.
        expect(readFileSync(join(output, "validators", "uploads.validator.ts"), "utf8")).toContain(
            "export const uploadInheritedBody =",
        );
    });
});
