// Angular's packages are partially compiled: outside an Angular build they
// need the JIT compiler loaded before anything of theirs is imported.
import "@angular/compiler";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    EnvironmentInjector,
    EnvironmentProviders,
    Injector,
    Provider,
    provideZonelessChangeDetection,
    runInInjectionContext,
    ɵcreateInjector as createInjector,
    ɵINJECTOR_SCOPE as INJECTOR_SCOPE,
} from "@angular/core";
import {
    HttpClient,
    HttpErrorResponse,
    HttpEvent,
    HttpInterceptorFn,
    HttpXhrBackend,
    provideHttpClient,
    withFetch,
    withInterceptors,
} from "@angular/common/http";
import { OperatorFunction, retry, tap } from "rxjs";
import { createOutputDirs, fixturePath } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";

/**
 * The generated stream readers behind Angular's own backends, making the
 * request a generated streaming method makes: a real `HttpClient` with the
 * fetch backend and interceptors against a local server, and the XHR backend
 * over a scripted XMLHttpRequest. `http-stream.test.ts` feeds the reader the
 * events it is supposed to get; this suite checks that those are the events
 * Angular sends — above all for a response that fails, whose body both
 * backends report as progress before they report the failure.
 */

interface HttpStream {
    streamJsonLines<T>(): OperatorFunction<HttpEvent<string>, T>;
    streamServerSentEvents<T>(): OperatorFunction<HttpEvent<string>, T>;
}

type Route = (request: IncomingMessage, response: ServerResponse) => void;

const outputDirs = createOutputDirs();
let httpStream: HttpStream;
let server: Server;
let baseUrl: string;
const routes = new Map<string, Route>();

beforeAll(async () => {
    const output = outputDirs.create("http-stream-e2e-");
    await generateFromConfig({
        input: fixturePath("openapi-3.2"),
        output,
        options: { dateType: "string", enumStyle: "union", generateServices: true },
    });
    httpStream = (await import(pathToFileURL(join(output, "utils", "http-stream.ts")).href)) as HttpStream;

    server = createServer((request, response) => {
        const route = routes.get(request.url ?? "");
        if (route) {
            route(request, response);
        } else {
            response.writeHead(404).end();
        }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    outputDirs.cleanup();
});

/**
 * An `HttpClient` as an app gets it from `provideHttpClient(withFetch())`.
 * Built on a bare root injector, which is all it needs: there is no platform
 * to bootstrap in Node. The two `ɵ` imports are how Angular makes one itself;
 * their typings predate environment providers, which they accept all the same.
 */
function httpClient(...interceptors: HttpInterceptorFn[]): HttpClient {
    const providers: Array<Provider | EnvironmentProviders> = [
        { provide: INJECTOR_SCOPE, useValue: "root" },
        { provide: EnvironmentInjector, useExisting: Injector },
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch(), withInterceptors(interceptors)),
    ];
    return createInjector(class {}, null, providers as Provider[]).get(HttpClient);
}

interface Outcome<T> {
    items: T[];
    error?: unknown;
}

/** Makes the request a generated streaming method makes, and collects what it emits. */
function read<T>(
    http: HttpClient,
    path: string,
    operator: OperatorFunction<HttpEvent<string>, T>,
    onItem?: (item: T) => void,
): Promise<Outcome<T>> {
    return new Promise((resolve) => {
        const items: T[] = [];
        http.request("get", `${baseUrl}${path}`, { observe: "events", responseType: "text", reportProgress: true })
            .pipe(operator)
            .subscribe({
                next: (item) => {
                    items.push(item);
                    onItem?.(item);
                },
                error: (error) => resolve({ items, error }),
                complete: () => resolve({ items }),
            });
    });
}

const NDJSON = { "content-type": "application/x-ndjson" };

describe("generated stream readers over HttpClient and fetch", () => {
    it("emits an item while the response is still open", async () => {
        // The server holds the response open until the client has the first
        // item: were items only emitted at the end, this would never finish.
        let release: () => void = () => undefined;
        const firstItemSeen = new Promise<void>((resolve) => (release = resolve));
        routes.set("/orders", (_, response) => {
            response.writeHead(200, NDJSON);
            response.write('{"n":1}\n{"n"');
            void firstItemSeen.then(() => response.end(':2}\n{"n":3}'));
        });

        const { items, error } = await read(httpClient(), "/orders", httpStream.streamJsonLines<{ n: number }>(), () =>
            release(),
        );

        expect(error).toBeUndefined();
        expect(items).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    it("reads Server-Sent Events", async () => {
        routes.set("/events", (_, response) => {
            response.writeHead(200, { "content-type": "text/event-stream" });
            response.write("event: created\ndata: 1\n\n");
            response.end(": keep-alive\n\ndata: 2\n\n");
        });

        const { items, error } = await read(httpClient(), "/events", httpStream.streamServerSentEvents());

        expect(error).toBeUndefined();
        expect(items).toEqual([{ event: "created", data: "1" }, { data: "2" }]);
    });

    it("fails with the error response, and emits nothing of its body", async () => {
        routes.set("/boom", (_, response) => {
            response.writeHead(500, NDJSON);
            // One JSON line: exactly what the reader would take for an item.
            response.end('{"message":"boom"}\n');
        });

        const { items, error } = await read(httpClient(), "/boom", httpStream.streamJsonLines());

        expect(items).toEqual([]);
        expect(error).toBeInstanceOf(HttpErrorResponse);
        expect((error as HttpErrorResponse).status).toBe(500);
        expect((error as HttpErrorResponse).error).toBe('{"message":"boom"}\n');
    });

    it("keeps the status of an error whose body is not in the format at all", async () => {
        routes.set("/gateway", (_, response) => {
            response.writeHead(502, { "content-type": "text/html" });
            response.end("<html><body><h1>502 Bad Gateway</h1></body></html>\n");
        });

        const { items, error } = await read(httpClient(), "/gateway", httpStream.streamJsonLines());

        expect(items).toEqual([]);
        // Not a SyntaxError from a line that is not JSON.
        expect(error).toBeInstanceOf(HttpErrorResponse);
        expect((error as HttpErrorResponse).status).toBe(502);
    });

    it("lets an interceptor see the error", async () => {
        const seen: number[] = [];
        const logErrors: HttpInterceptorFn = (request, next) =>
            next(request).pipe(tap({ error: (error: HttpErrorResponse) => seen.push(error.status) }));

        await read(httpClient(logErrors), "/gateway", httpStream.streamJsonLines());

        expect(seen).toEqual([502]);
    });

    it("reads the response of a request an interceptor sent again", async () => {
        let attempts = 0;
        routes.set("/flaky", (_, response) => {
            attempts++;
            if (attempts === 1) {
                response.writeHead(503, NDJSON);
                response.end('{"message":"try again in a moment"}\n');
            } else {
                response.writeHead(200, NDJSON);
                response.end('{"n":1}\n{"n":2}\n');
            }
        });
        const retryOnce: HttpInterceptorFn = (request, next) => next(request).pipe(retry(1));

        const { items, error } = await read(httpClient(retryOnce), "/flaky", httpStream.streamJsonLines());

        expect(attempts).toBe(2);
        expect(error).toBeUndefined();
        // Neither the first response's error message, nor the second read from where the first ended.
        expect(items).toEqual([{ n: 1 }, { n: 2 }]);
    });
});

/**
 * Node has no XMLHttpRequest, so the XHR backend gets one that is scripted:
 * enough of the interface for `HttpXhrBackend` to run its own event logic,
 * which is the part that matters here — when it sends the status, and what
 * it reports as progress.
 */
class ScriptedXhr {
    status = 0;
    statusText = "";
    responseText = "";
    response: unknown = null;
    responseURL = "";
    responseType = "";
    withCredentials = false;
    timeout = 0;
    readyState = 0;
    readonly upload = { addEventListener: () => undefined, removeEventListener: () => undefined };
    private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

    open(): void {
        this.readyState = 1;
    }
    send(): void {
        this.readyState = 2;
    }
    abort(): void {
        this.readyState = 0;
    }
    setRequestHeader(): void {
        // Nothing reads the request headers back.
    }
    getAllResponseHeaders(): string {
        return "content-type: application/x-ndjson";
    }
    getResponseHeader(): string | null {
        return null;
    }
    addEventListener(type: string, listener: (event: unknown) => void): void {
        this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener));
    }
    removeEventListener(type: string, listener: (event: unknown) => void): void {
        this.listeners.get(type)?.delete(listener);
    }

    /** The server answers `status` and has sent `text` so far. */
    receive(status: number, text: string): void {
        this.status = status;
        this.statusText = status === 200 ? "OK" : "Error";
        this.responseText = text;
        this.readyState = 3;
        this.dispatch("progress", { loaded: text.length, lengthComputable: false });
    }
    /** The response has ended. */
    finish(): void {
        this.response = this.responseText;
        this.readyState = 4;
        this.dispatch("load", {});
    }
    private dispatch(type: string, event: unknown): void {
        for (const listener of [...(this.listeners.get(type) ?? [])]) {
            listener(event);
        }
    }
}

describe("generated stream readers over the XHR backend", () => {
    function open<T>(operator: OperatorFunction<HttpEvent<string>, T>) {
        const xhr = new ScriptedXhr();
        const backend = runInInjectionContext(
            Injector.create({ providers: [] }),
            () => new HttpXhrBackend({ build: () => xhr as unknown as XMLHttpRequest }),
        );
        const outcome: Outcome<T> & { completed: boolean } = { items: [], completed: false };
        new HttpClient(backend)
            .request("get", "/orders", { observe: "events", responseType: "text", reportProgress: true })
            .pipe(operator)
            .subscribe({
                next: (item) => outcome.items.push(item),
                error: (error) => (outcome.error = error),
                complete: () => (outcome.completed = true),
            });
        return { xhr, outcome };
    }

    it("emits the items of a successful response as they arrive", () => {
        const { xhr, outcome } = open(httpStream.streamJsonLines<{ n: number }>());

        xhr.receive(200, '{"n":1}\n{"n"');
        expect(outcome.items).toEqual([{ n: 1 }]);
        xhr.receive(200, '{"n":1}\n{"n":2}\n');
        xhr.finish();

        expect(outcome.items).toEqual([{ n: 1 }, { n: 2 }]);
        expect(outcome.completed).toBe(true);
    });

    it("fails with the error response, and emits nothing of its body", () => {
        const { xhr, outcome } = open(httpStream.streamJsonLines());

        xhr.receive(500, '{"message":"boom"}\n');
        expect(outcome.items).toEqual([]);
        expect(outcome.error).toBeUndefined();
        xhr.finish();

        expect(outcome.items).toEqual([]);
        expect(outcome.error).toBeInstanceOf(HttpErrorResponse);
        expect((outcome.error as HttpErrorResponse).status).toBe(500);
    });
});
