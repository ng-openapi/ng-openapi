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
