// Angular's packages are partially compiled: outside an Angular build they
// need the JIT compiler loaded before anything of theirs is imported.
import "@angular/compiler";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpErrorResponse, HttpEvent, HttpEventType, HttpHeaderResponse, HttpResponse } from "@angular/common/http";
import { Observable, of, OperatorFunction, Subject } from "rxjs";
import { createOutputDirs, fixturePath } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";

/**
 * The generated `utils/http-stream.ts` at run time: the file is generated,
 * imported, and fed the events `HttpClient` emits for a text response read
 * with `reportProgress`. Compiling it, which every other suite does, says
 * nothing about where a line ends.
 */

interface HttpStream {
    streamJsonLines<T>(): OperatorFunction<HttpEvent<string>, T>;
    streamJsonSequence<T>(): OperatorFunction<HttpEvent<string>, T>;
    streamServerSentEvents<T>(): OperatorFunction<HttpEvent<string>, T>;
    parseJsonLines<T>(text: string): T[];
    parseJsonSequence<T>(text: string): T[];
    parseServerSentEvents<T>(text: string): T[];
    parseSequenceBody<T>(parse: (text: string) => T[]): OperatorFunction<unknown, unknown>;
}

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

let httpStream: HttpStream;
beforeAll(async () => {
    const output = outputDirs.create("http-stream-");
    await generateFromConfig({
        input: fixturePath("openapi-3.2"),
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: true },
    });
    httpStream = (await import(pathToFileURL(join(output, "utils", "http-stream.ts")).href)) as HttpStream;
});

/** What HttpClient emits while a text response downloads: all the text so far, each time. */
const progress = (partialText: string): HttpEvent<string> =>
    ({ type: HttpEventType.DownloadProgress, loaded: partialText.length, partialText }) as HttpEvent<string>;
const response = (body: string): HttpEvent<string> => new HttpResponse({ body, status: 200 });
const sent: HttpEvent<string> = { type: HttpEventType.Sent };
/** The status line and headers, which both backends emit before any progress. */
const header = (status: number): HttpEvent<string> => new HttpHeaderResponse({ status });

/** Subscribes, and records what was emitted after each event that is pushed. */
function collect<T>(operator: OperatorFunction<HttpEvent<string>, T>) {
    const source = new Subject<HttpEvent<string>>();
    const items: T[] = [];
    let error: unknown;
    let completed = false;
    const subscription = source.pipe(operator).subscribe({
        next: (item) => items.push(item),
        error: (reason) => (error = reason),
        complete: () => (completed = true),
    });
    return {
        push: (event: HttpEvent<string>) => {
            source.next(event);
            return [...items];
        },
        end: () => source.complete(),
        fail: (reason: unknown) => source.error(reason),
        items,
        subscription,
        get error() {
            return error;
        },
        get completed() {
            return completed;
        },
        get observed() {
            return source.observed;
        },
    };
}

const toArray = <T>(observable: Observable<T>): T[] => {
    const items: T[] = [];
    observable.subscribe((item) => items.push(item));
    return items;
};

describe("generated http-stream helper: JSON Lines", () => {
    it("emits each line once it is complete, and never twice", () => {
        const stream = collect(httpStream.streamJsonLines<{ n: number }>());

        expect(stream.push(sent)).toEqual([]);
        // The second line has not ended yet.
        expect(stream.push(progress('{"n":1}\n{"n"'))).toEqual([{ n: 1 }]);
        expect(stream.push(progress('{"n":1}\n{"n":2}\n'))).toEqual([{ n: 1 }, { n: 2 }]);
        // Nothing new arrived.
        expect(stream.push(progress('{"n":1}\n{"n":2}\n'))).toEqual([{ n: 1 }, { n: 2 }]);
        // The last line of a response needs no line feed.
        expect(stream.push(response('{"n":1}\n{"n":2}\n{"n":3}'))).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);

        stream.end();
        expect(stream.completed).toBe(true);
        expect(stream.error).toBeUndefined();
    });

    it("reads a response that arrives without progress events, and skips blank lines and CRLF", () => {
        expect(toArray(of(response('{"n":1}\r\n\r\n{"n":2}\r\n')).pipe(httpStream.streamJsonLines()))).toEqual([
            { n: 1 },
            { n: 2 },
        ]);
        expect(toArray(of(response("")).pipe(httpStream.streamJsonLines()))).toEqual([]);
    });

    it("fails the stream on a line that is not JSON, after the items before it", () => {
        const stream = collect(httpStream.streamJsonLines<{ n: number }>());

        stream.push(progress('{"n":1}\nnot json\n'));

        expect(stream.items).toEqual([{ n: 1 }]);
        expect(stream.error).toBeInstanceOf(SyntaxError);
        // The request is let go of.
        expect(stream.observed).toBe(false);
    });

    it("passes a failed request on, and cancels the request when unsubscribed", () => {
        const failing = collect(httpStream.streamJsonLines());
        const failure = new Error("503");
        failing.fail(failure);
        expect(failing.error).toBe(failure);

        const cancelled = collect(httpStream.streamJsonLines());
        expect(cancelled.observed).toBe(true);
        cancelled.subscription.unsubscribe();
        expect(cancelled.observed).toBe(false);
    });
});

/**
 * The backends report the body of a 4xx or 5xx response as progress as well,
 * and only then fail the request. Those events are what these tests push.
 */
describe("generated http-stream helper: a response that is not the stream", () => {
    it("does not read the body of an error response as items", () => {
        const stream = collect(httpStream.streamJsonLines<{ n: number }>());
        const failure = new HttpErrorResponse({ status: 500, error: '{"message":"boom"}\n' });

        stream.push(sent);
        stream.push(header(500));
        // A JSON line, as far as the format goes: it is an error message all the same.
        expect(stream.push(progress('{"message":"boom"}\n'))).toEqual([]);
        stream.fail(failure);

        expect(stream.items).toEqual([]);
        expect(stream.error).toBe(failure);
    });

    it("passes the error on when its body is nothing the format could read", () => {
        const stream = collect(httpStream.streamJsonLines());
        const failure = new HttpErrorResponse({ status: 502 });

        stream.push(sent);
        stream.push(header(502));
        stream.push(progress("<html><body>502 Bad Gateway</body></html>\n"));

        // No SyntaxError, and the request is still subscribed to: whatever
        // sits between the backend and the caller sees the error it sends.
        expect(stream.error).toBeUndefined();
        expect(stream.observed).toBe(true);
        stream.fail(failure);
        expect(stream.error).toBe(failure);
    });

    it("reads a request that is sent again from the start of the new response", () => {
        const stream = collect(httpStream.streamJsonLines<{ n: number }>());

        // What an interceptor that retries produces: the events of both attempts.
        stream.push(sent);
        stream.push(header(503));
        stream.push(progress('{"message":"try again in a moment"}\n'));
        stream.push(sent);
        stream.push(header(200));
        expect(stream.push(progress('{"n":1}\n'))).toEqual([{ n: 1 }]);
        expect(stream.push(response('{"n":1}\n{"n":2}\n'))).toEqual([{ n: 1 }, { n: 2 }]);
        stream.end();

        expect(stream.error).toBeUndefined();
        expect(stream.completed).toBe(true);
    });

    it("reads a second attempt from its start even when the first was being read", () => {
        const stream = collect(httpStream.streamJsonLines<{ n: number }>());

        stream.push(sent);
        stream.push(header(200));
        stream.push(progress('{"n":1}\n{"n":2}\n{"n"'));
        // The connection dropped and the request was sent again.
        stream.push(sent);
        stream.push(header(200));
        expect(stream.push(progress('{"n":7}\n'))).toEqual([{ n: 1 }, { n: 2 }, { n: 7 }]);

        expect(stream.error).toBeUndefined();
    });

    it("holds for every format", () => {
        const events = collect(httpStream.streamServerSentEvents());
        events.push(header(500));
        expect(events.push(progress("data: internal error\n\n"))).toEqual([]);

        const records = collect(httpStream.streamJsonSequence());
        records.push(header(404));
        expect(records.push(progress('\u001e{"message":"not found"}\n'))).toEqual([]);
    });

    it("reads progress that comes without a status, as a custom backend may send it", () => {
        const stream = collect(httpStream.streamJsonLines<{ n: number }>());
        expect(stream.push(progress('{"n":1}\n'))).toEqual([{ n: 1 }]);
    });
});

describe("generated http-stream helper: JSON text sequences", () => {
    const RS = "\u001e";

    it("emits a record at the line feed that ends it, without waiting for the next one", () => {
        const stream = collect(httpStream.streamJsonSequence<{ n: number }>());

        expect(stream.push(progress(`${RS}{"n":1}`))).toEqual([]);
        expect(stream.push(progress(`${RS}{"n":1}\n`))).toEqual([{ n: 1 }]);
        // Never twice: not at the next record, and not when the response ends.
        expect(stream.push(progress(`${RS}{"n":1}\n${RS}`))).toEqual([{ n: 1 }]);
        expect(stream.push(response(`${RS}{"n":1}\n${RS}{"n":2}\n`))).toEqual([{ n: 1 }, { n: 2 }]);
    });

    it("does not take a line feed inside a record for its end", () => {
        const stream = collect(httpStream.streamJsonSequence<{ n: number }>());

        // Pretty-printed over several lines: complete only once it reads as JSON.
        expect(stream.push(progress(`${RS}{\n`))).toEqual([]);
        expect(stream.push(progress(`${RS}{\n  "n": 1,\n`))).toEqual([]);
        expect(stream.push(progress(`${RS}{\n  "n": 1,\n  "m": 2\n}\n`))).toEqual([{ n: 1, m: 2 }]);
        // A record the response ends in the middle of is not JSON, and fails the stream.
        const cut = collect(httpStream.streamJsonSequence());
        cut.push(response(`${RS}{"n":1}\n${RS}{"n":`));
        expect(cut.items).toEqual([{ n: 1 }]);
        expect(cut.error).toBeInstanceOf(SyntaxError);
    });

    it("parses a complete sequence", () => {
        expect(httpStream.parseJsonSequence(`${RS}{"n":1}\n${RS}[2]\n${RS}"three"\n`)).toEqual([
            { n: 1 },
            [2],
            "three",
        ]);
    });
});

describe("generated http-stream helper: Server-Sent Events", () => {
    it("emits an event at the blank line that ends it", () => {
        const stream = collect(httpStream.streamServerSentEvents<object>());

        expect(stream.push(progress("event: created\ndata: 1"))).toEqual([]);
        expect(stream.push(progress("event: created\ndata: 1\n\nevent: sh"))).toEqual([
            { event: "created", data: "1" },
        ]);
        expect(stream.push(progress("event: created\ndata: 1\n\nevent: shipped\ndata: 2\n\n"))).toEqual([
            { event: "created", data: "1" },
            { event: "shipped", data: "2" },
        ]);
    });

    it("reads fields the way the event-stream format defines them", () => {
        // The example of the OpenAPI 3.2 specification, and its JSON Lines equivalent.
        const text = [
            "event: addString",
            "data: This data is formatted",
            "data: across two lines",
            "retry: 5",
            "",
            "event: addInt64",
            "data: 1234.5678",
            "unknownField: this is ignored",
            "",
            ": This is a comment",
            "event: addJSON",
            'data: {"foo": 42}',
        ].join("\n");

        expect(httpStream.parseServerSentEvents(text)).toEqual([
            { event: "addString", data: "This data is formatted\nacross two lines", retry: 5 },
            { event: "addInt64", data: "1234.5678" },
            { event: "addJSON", data: '{"foo": 42}' },
        ]);
    });

    it("handles CRLF, a field without a value, an id, and blocks that hold nothing", () => {
        const text = "id: 7\r\ndata\r\n\r\n: keep-alive\r\n\r\nretry: soon\r\n\r\ndata:no space\r\n\r\n";

        expect(httpStream.parseServerSentEvents(text)).toEqual([{ id: "7", data: "" }, { data: "no space" }]);
    });

    it("emits only blocks that carry data, as the format dispatches them", () => {
        // A bare event name, an id and a retry delay on their own are not events.
        const text = "event: ping\n\nid: 9\n\nretry: 3000\n\nevent: created\nid: 10\nretry: 5\ndata: 1\n\n";

        expect(httpStream.parseServerSentEvents(text)).toEqual([{ event: "created", id: "10", retry: 5, data: "1" }]);
    });

    it("discards an event the stream ended in the middle of, and keeps the last event of a whole document", () => {
        const stream = collect(httpStream.streamServerSentEvents<object>());
        // The connection closed before the blank line: `2 and a ha` may be cut short.
        expect(stream.push(response("data: 1\n\ndata: 2 and a ha"))).toEqual([{ data: "1" }]);
        expect(stream.error).toBeUndefined();

        // A document handed over whole is not a stream that broke off.
        expect(httpStream.parseServerSentEvents("data: 1\n\ndata: 2")).toEqual([{ data: "1" }, { data: "2" }]);
    });

    it("ignores a byte-order mark at the start of the stream", () => {
        const text = String.fromCharCode(0xfeff) + "data: first" + String.fromCharCode(10, 10);

        expect(httpStream.parseServerSentEvents(text)).toEqual([{ data: "first" }]);
    });
});

describe("generated http-stream helper: a sequence that has ended", () => {
    it("parses JSON Lines into all its items", () => {
        expect(httpStream.parseJsonLines('{"n":1}\n{"n":2}\n')).toEqual([{ n: 1 }, { n: 2 }]);
    });

    it("replaces the text by the items for every way of observing the request", () => {
        const parse = httpStream.parseSequenceBody(httpStream.parseJsonLines);
        const text = '{"n":1}\n{"n":2}\n';

        // observe: 'body'
        expect(toArray(of(text).pipe(parse))).toEqual([[{ n: 1 }, { n: 2 }]]);

        // observe: 'response'
        const [full] = toArray(
            of(new HttpResponse({ body: text, status: 200 })).pipe(parse),
        ) as HttpResponse<unknown>[];
        expect(full).toBeInstanceOf(HttpResponse);
        expect(full.status).toBe(200);
        expect(full.body).toEqual([{ n: 1 }, { n: 2 }]);

        // observe: 'events': the response event is parsed, the others pass through.
        const events = toArray(of<unknown[]>(sent, progress(text), response(text)).pipe(parse));
        expect(events[0]).toBe(sent);
        expect((events[1] as { partialText: string }).partialText).toBe(text);
        expect((events[2] as HttpResponse<unknown>).body).toEqual([{ n: 1 }, { n: 2 }]);
    });
});
