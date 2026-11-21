// Angular's packages are partially compiled: outside an Angular build they
// need the JIT compiler loaded before anything of theirs is imported.
import "@angular/compiler";
import { describe, expect, it } from "vitest";
import { HttpClient, HttpHandler, HttpRequest, HttpResponse, HttpXhrBackend } from "@angular/common/http";
import { Injector, runInInjectionContext } from "@angular/core";
import { of } from "rxjs";

/**
 * What the generator assumes about Angular for a method declared under
 * `additionalOperations` (#136), checked against the Angular that is
 * installed: the name is sent upper-cased whatever the spec wrote, and the
 * request keeps its body although Angular has never heard of the method.
 * The first is why `extractPaths` upper-cases the key and says so; the second
 * is why such an operation is generated like any other that carries a body.
 * Every request goes through `HttpClient.request()`, as the generated code
 * sends it.
 */

/** The request `HttpClient.request(method, url, { body })` hands to its backend. */
function sent(method: string, body: unknown): HttpRequest<unknown> {
    let request: HttpRequest<unknown> | undefined;
    const handler: HttpHandler = {
        handle: (req) => {
            request = req;
            return of(new HttpResponse({ status: 204 }));
        },
    };
    new HttpClient(handler).request(method, "/files/1", { body }).subscribe();
    if (!request) {
        throw new Error("HttpClient did not hand the request to its handler");
    }
    return request;
}

describe("Angular's handling of a method it has no name for", () => {
    it.each([
        ["copy", "COPY"],
        ["Purge", "PURGE"],
        ["m-search", "M-SEARCH"],
        // Any HTTP token is a method name, `'` included.
        ["lock'd", "LOCK'D"],
    ])("sends %s as %s, with its body", (written, expected) => {
        const body = { note: "kept" };

        const request = sent(written, body);
        expect(request.method).toBe(expected);
        expect(request.body).toBe(body);

        // The same holds for the request object itself.
        const direct = new HttpRequest(written, "/files/1", body);
        expect(direct.method).toBe(expected);
        expect(direct.body).toBe(body);
    });
});

/**
 * JSONP is the one name that is skipped for what Angular does with it. What
 * that is depends on the backend the app configured, which the generator
 * cannot see: these are the two ends of it.
 */
describe("Angular's handling of JSONP", () => {
    it("lets the request through HttpClient like any other method, body included", () => {
        const body = { note: "kept" };

        // Nothing here stops it: with the fetch backend and no JSONP support,
        // this is what goes on the wire.
        const request = sent("jsonp", body);
        expect(request.method).toBe("JSONP");
        expect(request.body).toBe(body);
    });

    it("is refused by the XHR backend", () => {
        const backend = runInInjectionContext(
            Injector.create({ providers: [] }),
            () =>
                new HttpXhrBackend({
                    build: () => {
                        throw new Error("the backend must refuse the request before it builds an XMLHttpRequest");
                    },
                }),
        );

        expect(() => backend.handle(sent("jsonp", { note: "kept" }))).toThrow(/JSONP/);
    });
});
