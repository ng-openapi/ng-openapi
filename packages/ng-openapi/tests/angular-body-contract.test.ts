// Angular's packages are partially compiled: outside an Angular build they
// need the JIT compiler loaded before anything of theirs is imported.
import "@angular/compiler";
import { describe, expect, it } from "vitest";
import { HttpClient, HttpHandler, HttpRequest, HttpResponse } from "@angular/common/http";
import { of } from "rxjs";

/**
 * What the generator leaves to Angular for a request body (#136), checked
 * against the Angular that is installed. A generated method sets a
 * `Content-Type` only where the spec names one type; under a range (`*`/`*`,
 * `image/*`) it sets none and relies on what `HttpClient` declares for the
 * value it is given. And it hands a JSON body over as it is, so how that is
 * serialized is Angular's doing — including the one case the docs warn
 * about, a body that is already a string.
 */

/** The request `HttpClient.request("post", url, { body })` hands to its backend. */
function sent(body: unknown): HttpRequest<unknown> {
    let request: HttpRequest<unknown> | undefined;
    const handler: HttpHandler = {
        handle: (req) => {
            request = req;
            return of(new HttpResponse({ status: 204 }));
        },
    };
    new HttpClient(handler).request("post", "/items", { body }).subscribe();
    if (!request) {
        throw new Error("HttpClient did not hand the request to its handler");
    }
    return request;
}

describe("the Content-Type Angular declares for a body when the request sets none", () => {
    it.each([
        ["an object", { name: "a" }],
        ["an array", [1, 2]],
        ["a number", 3],
        ["a boolean", false],
    ])("is application/json for %s", (_, body) => {
        expect(sent(body).detectContentTypeHeader()).toBe("application/json");
    });

    it("is text/plain for a string", () => {
        expect(sent("plain").detectContentTypeHeader()).toBe("text/plain");
    });

    it("is the Blob's own type for a Blob", () => {
        expect(sent(new Blob(["x"], { type: "image/png" })).detectContentTypeHeader()).toBe("image/png");
    });

    it("is none for FormData: the browser writes the one with the boundary", () => {
        expect(sent(new FormData()).detectContentTypeHeader()).toBeNull();
    });
});

describe("how Angular serializes the body it is given", () => {
    it("writes a value as JSON", () => {
        expect(sent({ name: "a" }).serializeBody()).toBe('{"name":"a"}');
        expect(sent(3).serializeBody()).toBe("3");
    });

    it("sends a string as written, without quotes: not a JSON document unless the caller made it one", () => {
        expect(sent("plain").serializeBody()).toBe("plain");
        expect(sent(JSON.stringify("plain")).serializeBody()).toBe('"plain"');
    });

    it("sends a Blob as it is", () => {
        const blob = new Blob(["x"]);
        expect(sent(blob).serializeBody()).toBe(blob);
    });
});
