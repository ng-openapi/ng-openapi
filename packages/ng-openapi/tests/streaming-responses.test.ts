import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles, fixturePath, methodSource } from "@ng-openapi/testing";
import { generateFromConfig, GeneratorConfig } from "ng-openapi";

/**
 * Responses in a sequential media type (#136). With OpenAPI 3.2's
 * `itemSchema` the response is a stream and the method emits each item as it
 * arrives; with an array `schema` it is complete and the method emits the
 * array. The golden suite snapshots the same fixture, and
 * `http-stream.test.ts` runs the generated readers; these tests are about the
 * methods that use them.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

async function generate(prefix: string, config: Partial<GeneratorConfig> & { spec?: unknown } = {}) {
    const output = outputDirs.create(prefix);
    const { spec, ...rest } = config;
    let input = fixturePath("openapi-3.2");
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
    const read = (...path: string[]) => readFileSync(join(output, ...path), "utf8");
    return { output, result, read, service: (name: string) => read("services", `${name}.service.ts`) };
}

/** The signatures of a generated method: its overloads and its implementation. */
const signatures = (service: string, name: string) =>
    service.split("\n").filter((line) => line.startsWith(`    ${name}(`));

describe("streamed responses: itemSchema (#136)", () => {
    it("generates one signature that returns the items, read from the request's events", async () => {
        const { output, service } = await generate("streaming-");
        const orders = service("orders");

        // No `observe`, and so no overloads: the method emits the items.
        expect(signatures(orders, "streamOrders")).toEqual([
            "    streamOrders(status?: OrderStatus, options?: RequestOptions<'text'>): Observable<Order> {",
        ]);
        const streamOrders = methodSource(orders, "streamOrders");
        expect(streamOrders).toMatch(
            /request\('get', url, \{\s+observe: 'events',\s+headers,\s+params,\s+responseType: 'text',\s+reportProgress: true,/,
        );
        expect(streamOrders).toContain("}).pipe(streamJsonLines<Order>());");
        // It asks for the one format it reads.
        expect(streamOrders).toContain("headers = headers.set('Accept', 'application/jsonl');");

        expectGeneratedCodeCompiles(output);
    });

    it("picks the reader of the declared media type", async () => {
        const { service } = await generate("streaming-formats-");
        const orders = service("orders");

        const watchOrderEvents = methodSource(orders, "watchOrderEvents");
        expect(watchOrderEvents).toMatch(
            /^ {4}watchOrderEvents\(options\?: RequestOptions<'text'>\): Observable<OrderEvent>/,
        );
        expect(watchOrderEvents).toContain("}).pipe(streamServerSentEvents<OrderEvent>());");
        expect(watchOrderEvents).toContain("headers = headers.set('Accept', 'text/event-stream');");

        // A stream in answer to a request body.
        const replayOrders = methodSource(orders, "replayOrders");
        expect(replayOrders).toMatch(
            /^ {4}replayOrders\(orderExportRequest: OrderExportRequest, options\?: RequestOptions<'text'>\): Observable<Order>/,
        );
        expect(replayOrders).toMatch(/request\('post', url, \{\s+body: orderExportRequest,\s+observe: 'events',/);
        expect(replayOrders).toContain("}).pipe(streamJsonSequence<Order>());");
    });

    it("hands each item to the parse hook with response validation", async () => {
        const { output, service } = await generate("streaming-validation-", {
            options: { dateType: "string", enumStyle: "union", generateServices: true, validation: { response: true } },
        });
        const streamOrders = methodSource(service("orders"), "streamOrders");

        expect(streamOrders).toMatch(
            /^ {4}streamOrders\(status\?: OrderStatus, options\?: RequestOptions<'text', Order>\): Observable<Order>/,
        );
        expect(streamOrders).toContain(
            "}).pipe(streamJsonLines<Order>(), map(item => options?.parse?.(item) ?? item));",
        );

        expectGeneratedCodeCompiles(output);
    });

    it("takes the request object, then options, with useSingleRequestParameter", async () => {
        const { output, service } = await generate("streaming-single-param-", {
            options: {
                dateType: "string",
                enumStyle: "union",
                generateServices: true,
                useSingleRequestParameter: true,
            },
        });
        const orders = service("orders");

        expect(signatures(orders, "streamOrders")).toEqual([
            "    streamOrders(request?: StreamOrdersParams, options?: RequestOptions<'text'>): Observable<Order> {",
        ]);
        expect(methodSource(orders, "streamOrders")).toContain("const { status } = request ?? {};");
        // No arguments at all: only options.
        expect(signatures(orders, "watchOrderEvents")).toEqual([
            "    watchOrderEvents(options?: RequestOptions<'text'>): Observable<OrderEvent> {",
        ]);

        expectGeneratedCodeCompiles(output);
    });
});

describe("sequential responses declared complete: an array schema", () => {
    it("keeps the standard signature, fetches text and parses it into the array", async () => {
        const { service } = await generate("sequence-complete-");
        const orders = service("orders");

        expect(signatures(orders, "listArchivedOrders")).toEqual([
            "    listArchivedOrders(observe?: 'body', options?: RequestOptions<'text'>): Observable<Array<Order>>;",
            "    listArchivedOrders(observe?: 'response', options?: RequestOptions<'text'>): Observable<HttpResponse<Array<Order>>>;",
            "    listArchivedOrders(observe?: 'events', options?: RequestOptions<'text'>): Observable<HttpEvent<Array<Order>>>;",
            "    listArchivedOrders(observe?: 'body' | 'events' | 'response', options?: RequestOptions<'arraybuffer' | 'blob' | 'json' | 'text'>): Observable<any> {",
        ]);
        const listArchivedOrders = methodSource(orders, "listArchivedOrders");
        // Not JSON: `JSON.parse` fails on the second line of such a body.
        expect(listArchivedOrders).toMatch(/observe,\s+headers,\s+responseType: 'text',/);
        expect(listArchivedOrders).toContain("}).pipe(parseSequenceBody(parseJsonLines));");
    });

    it("parses first and validates the array after", async () => {
        const { service } = await generate("sequence-complete-validation-", {
            options: { dateType: "string", enumStyle: "union", generateServices: true, validation: { response: true } },
        });
        expect(methodSource(service("orders"), "listArchivedOrders")).toContain(
            "}).pipe(parseSequenceBody(parseJsonLines), map(response => options?.parse?.(response) ?? response));",
        );
    });
});

describe("dates in the items of a sequential response", () => {
    const withDates = { dateType: "Date" as const, enumStyle: "union" as const, generateServices: true };

    it("converts them where the items are parsed, with the client's own date interceptor", async () => {
        const { output, service } = await generate("streaming-dates-", { options: withDates });
        const orders = service("orders");

        // `Order.placedAt` is typed Date. The interceptor sees the response as
        // text, so without this each item would carry the string instead.
        expect(orders).toContain(
            "    private readonly dateInterceptor = inject(HTTP_INTERCEPTORS_DEFAULT, { optional: true })" +
                "?.find((interceptor): interceptor is DateInterceptor => interceptor instanceof DateInterceptor);",
        );
        expect(orders).toMatch(
            /private reviveDates<T>\(value: T\): T \{\s+return this\.dateInterceptor \? this\.dateInterceptor\.transform\(value\) : value;\s+\}/,
        );
        expect(methodSource(orders, "streamOrders")).toContain(
            "}).pipe(streamJsonLines<Order>(), map(item => this.reviveDates(item)));",
        );
        expect(methodSource(orders, "replayOrders")).toContain(
            "}).pipe(streamJsonSequence<Order>(), map(item => this.reviveDates(item)));",
        );
        // Complete: the whole array, inside the parse, so every `observe` gets it.
        expect(methodSource(orders, "listArchivedOrders")).toContain(
            "}).pipe(parseSequenceBody(text => this.reviveDates(parseJsonLines(text))));",
        );

        expectGeneratedCodeCompiles(output);
    });

    it("leaves a Server-Sent Event alone: its fields are text by definition", async () => {
        const { service } = await generate("streaming-dates-sse-", { options: withDates });
        expect(methodSource(service("orders"), "watchOrderEvents")).toContain(
            "}).pipe(streamServerSentEvents<OrderEvent>());",
        );
    });

    it("converts before the caller's parse hook sees the item", async () => {
        const { output, service } = await generate("streaming-dates-validation-", {
            options: { ...withDates, validation: { response: true } },
        });
        expect(methodSource(service("orders"), "streamOrders")).toContain(
            "}).pipe(streamJsonLines<Order>(), map(item => this.reviveDates(item)), " +
                "map(item => options?.parse?.(item) ?? item));",
        );

        expectGeneratedCodeCompiles(output);
    });

    it("adds nothing to a class without a sequential response, or with dateType string", async () => {
        const withDateType = await generate("streaming-dates-other-class-", { options: withDates });
        expect(withDateType.service("products")).not.toContain("dateInterceptor");
        expect(withDateType.service("products")).not.toContain("HTTP_INTERCEPTORS_DEFAULT");

        const withStrings = await generate("streaming-dates-strings-");
        expect(withStrings.service("orders")).not.toContain("dateInterceptor");
        expect(withStrings.service("orders")).not.toContain("reviveDates");
    });

    it("renames an operation that would take the name of one of these members", async () => {
        const { result, service } = await generate("streaming-dates-reserved-", {
            options: withDates,
            spec: {
                openapi: "3.2.0",
                info: { title: "Names", version: "1.0.0" },
                paths: {
                    "/revive": {
                        get: {
                            operationId: "reviveDates",
                            tags: ["Names"],
                            responses: {
                                "200": {
                                    description: "ok",
                                    content: { "application/jsonl": { itemSchema: { type: "object" } } },
                                },
                            },
                        },
                    },
                },
            },
        });

        expect(service("names")).toContain("    _reviveDates(options?: RequestOptions<'text'>): Observable<");
        expect(result.warnings).toContainEqual(
            expect.stringContaining('would be named "reviveDates", which the generated class already binds'),
        );
    });
});

describe("the generated http-stream helper file", () => {
    it("is generated and exported for a spec with a sequential response", async () => {
        const { output, read, service } = await generate("stream-helper-");

        expect(existsSync(join(output, "utils", "http-stream.ts"))).toBe(true);
        expect(read("index.ts")).toContain(`export * from "./utils/http-stream";`);
        expect(service("orders")).toMatch(
            /import \{ [^}]*streamJsonLines[^}]*parseSequenceBody[^}]* \} from "\.\.\/utils\/http-stream";/,
        );
    });

    it("is not generated for a spec without one", async () => {
        const output = outputDirs.create("stream-helper-absent-");
        const result = await generateFromConfig({
            input: fixturePath("openapi-3.1"),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
        });

        expect(existsSync(join(output, "utils", "http-stream.ts"))).toBe(false);
        expect(result.filesWritten.some((file) => file.includes("http-stream"))).toBe(false);
        expect(readFileSync(join(output, "index.ts"), "utf8")).not.toContain("http-stream");
    });
});

describe("sequential media types that are described another way", () => {
    const content = (contentType: string, mediaType: object) => ({
        "200": { description: "ok", content: { [contentType]: mediaType } },
    });
    const get = (operationId: string, responses: object) => ({ get: { operationId, tags: ["Feed"], responses } });
    const item = { $ref: "#/components/schemas/Entry" };
    const spec = {
        openapi: "3.2.0",
        info: { title: "Feeds", version: "1.0.0" },
        paths: {
            // The usual way to say "an event stream" before OpenAPI 3.2.
            "/legacy": get("legacyEvents", content("text/event-stream", { schema: { type: "string" } })),
            // A JSON alternative: the response is read as the JSON document.
            "/either": get("eitherWay", {
                "200": {
                    description: "ok",
                    content: {
                        "application/jsonl": { itemSchema: item },
                        "application/json": { schema: { type: "array", items: item } },
                    },
                },
            }),
            // No generated reader for multipart streams.
            "/parts": get("mixedParts", content("multipart/mixed", { itemSchema: item })),
            // An inline item schema.
            "/inline": get("inlineItems", content("application/x-ndjson", { itemSchema: { type: "integer" } })),
            // How a stream of items was written before `itemSchema`: the schema of one of them.
            "/legacy-items": get("legacyItems", content("application/x-ndjson", { schema: item })),
            // The schema of the payload, where the items are the events that carry it.
            "/entry-events": get("entryEvents", content("text/event-stream", { itemSchema: item })),
        },
        components: { schemas: { Entry: { type: "object", properties: { id: { type: "string" } } } } },
    };

    it("leaves a sequential media type with a plain schema as the text it is typed as", async () => {
        const { output, service } = await generate("sequence-legacy-", { spec });
        const legacyEvents = methodSource(service("feed"), "legacyEvents");

        expect(signatures(service("feed"), "legacyEvents")[0]).toBe(
            "    legacyEvents(observe?: 'body', options?: RequestOptions<'text'>): Observable<string>;",
        );
        expect(legacyEvents).not.toContain(".pipe(");

        expectGeneratedCodeCompiles(output);
    });

    it("reads the JSON alternative when the response offers one", async () => {
        const { result, service } = await generate("sequence-alternative-", { spec });
        const eitherWay = methodSource(service("feed"), "eitherWay");

        expect(signatures(service("feed"), "eitherWay")[0]).toBe(
            "    eitherWay(observe?: 'body', options?: RequestOptions<'json'>): Observable<Array<Entry>>;",
        );
        expect(eitherWay).toContain("headers = headers.set('Accept', 'application/json');");
        expect(eitherWay).not.toContain(".pipe(");
        // Another representation of the same response is not a loss to report.
        expect(result.warnings.filter((warning) => warning.includes("eitherWay"))).toEqual([]);
    });

    it("says so when an itemSchema has no reader, and returns the response whole", async () => {
        const { result, service } = await generate("sequence-unread-", { spec });

        expect(signatures(service("feed"), "mixedParts")[0]).toContain("Observable<Blob>");
        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(result.warnings.filter((warning) => warning.includes("mixedParts"))).toEqual([
            expect.stringContaining(
                'The "200" response of mixedParts ((GET) /parts) declares `itemSchema` for multipart/mixed, which ' +
                    "no stream is generated for",
            ),
        ]);
    });

    it("streams the items of a response whose schema describes one of them", async () => {
        const { output, result, service } = await generate("sequence-legacy-items-", { spec });
        const legacyItems = methodSource(service("feed"), "legacyItems");

        // Typed as before, and now true: each emission is an Entry, not the text of them all.
        expect(signatures(service("feed"), "legacyItems")).toEqual([
            "    legacyItems(options?: RequestOptions<'text'>): Observable<Entry> {",
        ]);
        expect(legacyItems).toContain(".pipe(streamJsonLines<Entry>())");
        expect(result.warnings.filter((warning) => warning.includes("legacyItems"))).toEqual([]);

        expectGeneratedCodeCompiles(output);
    });

    it("types the items of an event stream as events when the schema describes the payload", async () => {
        const { output, result, service } = await generate("sequence-payload-schema-", { spec });

        // What the reader emits, by the name the generated helper gives it. Not Entry.
        expect(signatures(service("feed"), "entryEvents")).toEqual([
            "    entryEvents(options?: RequestOptions<'text'>): Observable<ServerSentEvent> {",
        ]);
        expect(methodSource(service("feed"), "entryEvents")).toContain(
            ".pipe(streamServerSentEvents<ServerSentEvent>())",
        );
        expectGeneratedCodeCompiles(output);
        // Wording is pinned in shared/tests/normalize.test.ts.
        expect(result.warnings.filter((warning) => warning.includes("entryEvents"))).toEqual([
            expect.stringContaining(
                'The "200" response of entryEvents ((GET) /entry-events) describes the items of text/event-stream ' +
                    "with a schema that has no `data` property.",
            ),
        ]);
    });

    it("types the items of an inline item schema", async () => {
        const { service } = await generate("sequence-inline-", { spec });
        expect(signatures(service("feed"), "inlineItems")).toEqual([
            "    inlineItems(options?: RequestOptions<'text'>): Observable<number> {",
        ]);
    });
});
