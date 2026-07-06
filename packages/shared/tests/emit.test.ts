import { describe, expect, it } from "vitest";
import {
    emitDefaultHeadersMerge,
    emitHeaders,
    emitQueryParams,
    emitResponseTypeOption,
    emitSignalAwareQueryParams,
    emitUrlConstruction,
    emitUrlExpression,
    joinRequestOptionEntries,
    signalAwareParamValue,
} from "@ng-openapi/shared";
import type { Parameter } from "@ng-openapi/shared";

const pathParam = (name: string): Parameter => ({ name, in: "path" }) as Parameter;
const queryParam = (name: string): Parameter => ({ name, in: "query" }) as Parameter;

describe("url emission", () => {
    it("substitutes path params with camelCased identifiers", () => {
        expect(emitUrlConstruction("/pets/{pet_id}", [pathParam("pet_id")])).toBe(
            "const url = `${this.basePath}/pets/${petId}`;",
        );
    });

    it("leaves paths without params untouched", () => {
        expect(emitUrlExpression("/pets", [])).toBe("`${this.basePath}/pets`");
    });

    it("supports the signal-aware read for path params", () => {
        expect(emitUrlExpression("/pets/{id}", [pathParam("id")], signalAwareParamValue)).toBe(
            "`${this.basePath}/pets/${typeof id === 'function' ? id() : id}`",
        );
    });
});

describe("query-params emission", () => {
    it("returns empty string for no query params", () => {
        expect(emitQueryParams([])).toBe("");
        expect(emitSignalAwareQueryParams([])).toBe("");
    });

    it("emits an HttpParamsBuilder block per param", () => {
        const block = emitQueryParams([queryParam("page_size")]);
        expect(block).toContain("let params = new HttpParams();");
        expect(block).toContain("if (pageSize != null)");
        expect(block).toContain("HttpParamsBuilder.addToHttpParams(params, pageSize, 'page_size')");
    });

    it("reads each param once through the signal-aware variant", () => {
        const block = emitSignalAwareQueryParams([queryParam("limit")]);
        expect(block).toContain("const limitValue = typeof limit === 'function' ? limit() : limit;");
        expect(block).toContain("HttpParamsBuilder.addToHttpParams(params, limitValue, 'limit')");
    });
});

describe("headers emission", () => {
    it("normalizes caller headers from the given options expression", () => {
        const block = emitHeaders({ optionsExpression: "options" });
        expect(block).toContain("if (options?.headers instanceof HttpHeaders)");
        expect(block).toContain("headers = new HttpHeaders(options?.headers);");
    });

    it("adds configured default headers guarded by has()", () => {
        const block = emitHeaders({ optionsExpression: "options", customHeaders: { "X-Api-Key": "secret" } });
        expect(block).toContain("if (!headers.has('X-Api-Key'))");
        expect(block).toContain("headers = headers.set('X-Api-Key', 'secret');");
    });

    it("advertises the spec-derived Accept value guarded by has()", () => {
        const block = emitHeaders({
            optionsExpression: "options",
            accept: "application/vnd.users+json;version=1.0",
        });
        expect(block).toContain("if (!headers.has('Accept'))");
        expect(block).toContain("headers = headers.set('Accept', 'application/vnd.users+json;version=1.0');");
    });

    it("omits the Accept block when no accept value is given", () => {
        const block = emitHeaders({ optionsExpression: "options" });
        expect(block).not.toContain("Accept");
    });

    it("applies content-type rules in priority order", () => {
        const multipart = emitHeaders({
            optionsExpression: "options",
            contentType: { isMultipart: true, isUrlEncoded: false, hasBody: true },
        });
        expect(multipart).toContain("headers.delete('Content-Type')");

        const urlEncoded = emitHeaders({
            optionsExpression: "options",
            contentType: { isMultipart: false, isUrlEncoded: true, hasBody: true },
        });
        expect(urlEncoded).toContain("'application/x-www-form-urlencoded'");

        const json = emitHeaders({
            optionsExpression: "options",
            contentType: { isMultipart: false, isUrlEncoded: false, hasBody: true },
        });
        expect(json).toContain("'application/json'");

        const bodyless = emitHeaders({
            optionsExpression: "options",
            contentType: { isMultipart: false, isUrlEncoded: false, hasBody: false },
        });
        expect(bodyless).not.toContain("Content-Type");
    });
});

describe("default-headers merge (http-resource)", () => {
    it("handles both HttpHeaders and plain-record callers without casts", () => {
        const block = emitDefaultHeadersMerge("requestOptions", { "X-Api-Key": "secret" });
        expect(block).toContain("let headers = requestOptions?.headers;");
        expect(block).toContain("if (headers instanceof HttpHeaders)");
        expect(block).toContain("if (!headers.has('X-Api-Key'))");
        expect(block).toContain("headers = { 'X-Api-Key': 'secret', ...headers };");
        expect(block).not.toContain(" as ");
    });
});

describe("request-option entries", () => {
    it("pins non-JSON response types and stays silent for json", () => {
        expect(emitResponseTypeOption("json")).toBe("");
        expect(emitResponseTypeOption("blob")).toBe("responseType: 'blob'");
    });

    it("drops empty entries and entries referencing undefined", () => {
        expect(joinRequestOptionEntries(["headers", "", "reportProgress: undefined", "params"])).toBe(
            "headers,\n  params",
        );
    });
});
