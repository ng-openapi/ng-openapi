import { describe, expect, it } from "vitest";
import {
    defaultContentType,
    emitDefaultHeadersMerge,
    emitHeaders,
    emitMultipartFormData,
    emitQueryParams,
    emitResponseTypeOption,
    emitSignalAwareQueryParams,
    emitUrlConstruction,
    emitUrlEncodedFormBody,
    emitUrlExpression,
    joinRequestOptionEntries,
    signalAwareParamValue,
} from "@ng-openapi/shared";
import { camelCase } from "@ng-openapi/shared";
import type { ArgumentNames, Parameter } from "@ng-openapi/shared";

const pathParam = (name: string): Parameter => ({ name, in: "path" }) as Parameter;
const queryParam = (name: string): Parameter => ({ name, in: "query" }) as Parameter;
/** A resolved argument-name map for the given wire names, identity-mapped. */
const names = (...wireNames: string[]): ArgumentNames => {
    const identifiers = new Map(wireNames.map((wireName) => [wireName, camelCase(wireName)]));
    return {
        of: (wireName) => identifiers.get(wireName) ?? camelCase(wireName),
        all: [...identifiers.values()],
        renamed: [],
        merged: [],
    };
};

describe("url emission", () => {
    it("substitutes path params with camelCased identifiers", () => {
        expect(emitUrlConstruction("/pets/{pet_id}", [pathParam("pet_id")], names("pet_id"))).toBe(
            "const url = `${this.basePath}/pets/${petId}`;",
        );
    });

    it("leaves paths without params untouched", () => {
        expect(emitUrlExpression("/pets", [], names())).toBe("`${this.basePath}/pets`");
    });

    it("supports the signal-aware read for path params", () => {
        expect(emitUrlExpression("/pets/{id}", [pathParam("id")], names("id"), signalAwareParamValue)).toBe(
            "`${this.basePath}/pets/${typeof id === 'function' ? id() : id}`",
        );
    });
});

describe("query-params emission", () => {
    it("returns empty string for no query params", () => {
        expect(emitQueryParams([], names())).toBe("");
        expect(emitSignalAwareQueryParams([], names())).toBe("");
    });

    it("emits an HttpParamsBuilder block per param", () => {
        const block = emitQueryParams([queryParam("page_size")], names("page_size"));
        expect(block).toContain("let params = new HttpParams();");
        expect(block).toContain("if (pageSize != null)");
        expect(block).toContain("HttpParamsBuilder.addToHttpParams(params, pageSize, 'page_size')");
    });

    it("reads each param once through the signal-aware variant", () => {
        const block = emitSignalAwareQueryParams([queryParam("limit")], names("limit"));
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

    it("decides the Content-Type a request declares in one place, for every client", () => {
        const body = (isMultipart: boolean, isUrlEncoded: boolean, hasBody: boolean) =>
            defaultContentType({ isMultipart, isUrlEncoded, hasBody });

        expect(body(false, false, true)).toBe("application/json");
        expect(body(false, true, true)).toBe("application/x-www-form-urlencoded");
        // Only the browser can write a multipart header, and no body needs none.
        expect(body(true, false, true)).toBeUndefined();
        expect(body(true, true, true)).toBeUndefined();
        expect(body(false, false, false)).toBeUndefined();
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

    it("stays valid with no default to add", () => {
        const block = emitDefaultHeadersMerge("requestOptions", {});
        expect(block).toContain("headers = { ...headers };");
        expect(block).not.toContain("Add default headers");
    });

    it("removes Content-Type from both shapes for a multipart body, after merging the defaults", () => {
        const block = emitDefaultHeadersMerge("requestOptions", { "X-Api-Key": "secret" }, { dropContentType: true });
        expect(block).toContain("if (!headers.has('X-Api-Key'))");
        expect(block).toContain("headers = headers.delete('Content-Type');");
        // The record is matched by name the way HttpHeaders matches one.
        expect(block).toContain(
            "headers = Object.fromEntries(Object.entries({ 'X-Api-Key': 'secret', ...headers })" +
                ".filter(([name]) => name.toLowerCase() !== 'content-type'));",
        );
        expect(block.indexOf("headers.has('X-Api-Key')")).toBeLessThan(block.indexOf("headers.delete('Content-Type')"));
        expect(block).not.toContain(" as ");
    });

    it("removes Content-Type for a multipart body even with no default to add", () => {
        const block = emitDefaultHeadersMerge("requestOptions", {}, { dropContentType: true });
        expect(block).not.toContain("Add default headers");
        expect(block).not.toContain("headers.has(");
        expect(block).toContain("headers = headers.delete('Content-Type');");
        expect(block).toContain("Object.entries({ ...headers })");
    });
});

describe("form-body emission", () => {
    const multipart: Parameters<typeof emitMultipartFormData>[0] = {
        bodyKind: "multipart",
        formDataFields: ["file", "user-name", "attachments", "tags"],
        formDataSchema: {
            properties: {
                file: { type: "string", format: "binary" },
                "user-name": { type: "string" },
                attachments: { type: "array", items: { type: "string", format: "binary" } },
                tags: { type: "array", items: { type: "string" } },
            },
        },
    };
    const urlEncoded: Parameters<typeof emitUrlEncodedFormBody>[0] = {
        bodyKind: "urlencoded",
        urlEncodedFields: ["grant_type", "scope"],
        urlEncodedSchema: {
            properties: { grant_type: { type: "string" }, scope: { type: "array", items: { type: "string" } } },
        },
    };

    it("appends multipart fields to the container the caller names: files as they are, the rest stringified", () => {
        const block = emitMultipartFormData(multipart, names(...multipart.formDataFields), { container: "formData" });
        expect(block).toContain("const formData = new FormData();");
        expect(block).toContain("formData.append('file', file);");
        // The wire name stays in the literal; only the identifier is an expression.
        expect(block).toContain("formData.append('user-name', String(userName));");
        expect(block).toMatch(/attachments\.forEach\(\(item\) => \{[^}]*formData\.append\('attachments', item\);/);
        expect(block).toMatch(/tags\.forEach\(\(item\) => \{[^}]*formData\.append\('tags', String\(item\)\);/);
    });

    it("appends urlencoded fields, skipping null as well as undefined", () => {
        const block = emitUrlEncodedFormBody(urlEncoded, names(...urlEncoded.urlEncodedFields), {
            container: "formBody",
        });
        expect(block).toContain("const formBody = new URLSearchParams();");
        expect(block).toContain("if (grantType !== undefined && grantType !== null) {");
        expect(block).toContain("formBody.append('grant_type', String(grantType));");
        expect(block).toMatch(/scope\.forEach\(\(item\) => \{[^}]*formBody\.append\('scope', String\(item\)\);/);
    });

    it("reads each field once before testing it when the arguments may be signals", () => {
        const block = emitMultipartFormData(multipart, names(...multipart.formDataFields), {
            container: "payload",
            signalAware: true,
        });
        expect(block).toContain("const payload = new FormData();");
        expect(block).toContain(`const fileField = ${signalAwareParamValue("file")};`);
        expect(block).toContain("if (fileField !== undefined) {");
        expect(block).toContain("payload.append('file', fileField);");
        expect(block).toContain(`const tagsField = ${signalAwareParamValue("tags")};`);
        expect(block).toContain("tagsField.forEach((item) => {");
        // Nothing reads the argument a second time.
        expect(block.match(/typeof file === 'function'/g)).toHaveLength(1);
    });

    it("keeps a signal-aware temp clear of the arguments it shares a scope with", () => {
        const block = emitUrlEncodedFormBody(
            { bodyKind: "urlencoded", urlEncodedFields: ["scope", "scopeField"], urlEncodedSchema: { properties: {} } },
            names("scope", "scopeField"),
            { container: "formBody", signalAware: true },
        );
        expect(block).toContain(`const scopeField2 = ${signalAwareParamValue("scope")};`);
        expect(block).toContain(`const scopeFieldField = ${signalAwareParamValue("scopeField")};`);
    });

    it("emits nothing for an operation that sends another body, or a form without fields", () => {
        const options = { container: "formData" };
        expect(emitMultipartFormData({ ...multipart, bodyKind: "json" }, names(), options)).toBe("");
        expect(emitMultipartFormData({ ...multipart, bodyKind: undefined }, names(), options)).toBe("");
        expect(emitUrlEncodedFormBody({ ...urlEncoded, bodyKind: "multipart" }, names(), options)).toBe("");
        expect(emitUrlEncodedFormBody({ ...urlEncoded, bodyKind: undefined }, names(), options)).toBe("");
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
