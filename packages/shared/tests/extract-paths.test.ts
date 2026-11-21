import { describe, expect, it } from "vitest";
import { extractPaths } from "../src";

describe("extractPaths", () => {
    it("extracts one PathInfo per method, method uppercased", () => {
        const paths = extractPaths({
            "/pets": {
                get: { operationId: "listPets", responses: {} },
                post: { operationId: "createPet", responses: {} },
            },
        } as never);

        expect(paths).toHaveLength(2);
        expect(paths[0]).toMatchObject({ path: "/pets", method: "GET", operationId: "listPets" });
        expect(paths[1]).toMatchObject({ path: "/pets", method: "POST", operationId: "createPet" });
    });

    it("ignores path-item keys that are not operations", () => {
        const warnings: string[] = [];
        const paths = extractPaths(
            {
                "/pets": {
                    summary: "not an operation",
                    servers: [{ url: "https://pets.example" }],
                    "x-internal": { operationId: "vendorExtension" },
                    get: { operationId: "listPets" },
                },
            } as never,
            undefined,
            (message) => warnings.push(message),
        );

        expect(paths).toHaveLength(1);
        expect(paths[0].operationId).toBe("listPets");
        expect(warnings).toEqual([]);
    });

    it("skips a TRACE operation out loud: no browser sends one", () => {
        const warnings: string[] = [];
        const paths = extractPaths(
            { "/pets": { trace: { operationId: "tracePets" }, get: { operationId: "listPets" } } } as never,
            undefined,
            (message) => warnings.push(message),
        );

        expect(paths.map((p) => p.operationId)).toEqual(["listPets"]);
        expect(warnings).toEqual([
            "Operation tracePets ((TRACE) /pets) was skipped: browsers refuse to send TRACE requests, so no method " +
                "is generated for it.",
        ]);
    });

    it("extracts the OpenAPI 3.2 `query` path-item field as a QUERY operation, body included", () => {
        const requestBody = { content: { "application/json": { schema: { type: "object" } } } };
        const paths = extractPaths({
            "/pets/search": {
                parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }],
                query: { operationId: "searchPets", requestBody, responses: {} },
            },
        } as never);

        expect(paths).toHaveLength(1);
        expect(paths[0]).toMatchObject({ path: "/pets/search", method: "QUERY", operationId: "searchPets" });
        expect(paths[0].requestBody).toEqual(requestBody);
        expect(paths[0].parameters?.map((p) => p.name)).toEqual(["limit"]);
    });

    it("extracts a TRACE operation for a caller that lists the field, without calling it skipped", () => {
        const warnings: string[] = [];
        const paths = extractPaths(
            { "/pets": { trace: { operationId: "tracePets" }, get: { operationId: "listPets" } } } as never,
            ["get", "trace"],
            (m) => warnings.push(m),
        );

        expect(paths.map((p) => [p.method, p.operationId])).toEqual([
            ["GET", "listPets"],
            ["TRACE", "tracePets"],
        ]);
        expect(warnings).toEqual([]);
    });

    it("returns additionalOperations whatever fixed fields the caller lists", () => {
        const paths = extractPaths(
            {
                "/pets": {
                    get: { operationId: "listPets" },
                    post: { operationId: "createPet" },
                    additionalOperations: { PURGE: { operationId: "purgePets" } },
                },
            } as never,
            ["get"],
        );

        expect(paths.map((p) => p.operationId)).toEqual(["listPets", "purgePets"]);
    });

    describe("additionalOperations (OpenAPI 3.2)", () => {
        const extract = (additionalOperations: unknown, pathItem: Record<string, unknown> = {}) => {
            const warnings: string[] = [];
            const paths = extractPaths(
                { "/pets/{id}": { ...pathItem, additionalOperations } } as never,
                undefined,
                (m) => warnings.push(m),
            );
            return { paths, warnings };
        };

        it("extracts each entry as an operation of that method, after the fixed fields", () => {
            const requestBody = { content: { "application/json": { schema: { type: "object" } } } };
            const { paths, warnings } = extract(
                {
                    COPY: { operationId: "copyPet", requestBody, responses: {} },
                    PURGE: { responses: {} },
                },
                {
                    parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
                    get: { operationId: "getPet", responses: {} },
                },
            );

            expect(paths.map((p) => [p.method, p.operationId])).toEqual([
                ["GET", "getPet"],
                ["COPY", "copyPet"],
                ["PURGE", undefined],
            ]);
            // An ordinary operation in every other respect: body, path-level parameters.
            expect(paths[1].requestBody).toEqual(requestBody);
            expect(paths[2].parameters?.map((p) => p.name)).toEqual(["id"]);
            expect(warnings).toEqual([]);
        });

        it("upper-cases the method, as Angular will, and says so", () => {
            const { paths, warnings } = extract({ Copy: { operationId: "copyPet" } });

            expect(paths.map((p) => p.method)).toEqual(["COPY"]);
            expect(warnings).toEqual([
                'Operation "Copy" under `additionalOperations` of path "/pets/{id}" is sent as COPY: Angular\'s ' +
                    "HttpClient upper-cases method names.",
            ]);
        });

        it("keeps one operation for two keys that are the same method once upper-cased", () => {
            const { paths, warnings } = extract({ COPY: { operationId: "first" }, copy: { operationId: "second" } });

            expect(paths.map((p) => p.operationId)).toEqual(["first"]);
            expect(warnings).toEqual([
                'Operation "copy" under `additionalOperations` of path "/pets/{id}" was skipped: the path also ' +
                    "declares a COPY operation, and method names are sent upper-cased.",
            ]);
        });

        it.each(["JSONP", "jsonp"])("skips %s: whether Angular sends it depends on the app", (method) => {
            const { paths, warnings } = extract({ [method]: { operationId: "callback" } });

            expect(paths).toEqual([]);
            expect(warnings).toEqual([
                `Operation "${method}" under \`additionalOperations\` of path "/pets/{id}" was skipped: Angular's ` +
                    "HttpClient treats JSONP specially: its XHR backend refuses it and withJsonpSupport() turns it " +
                    "into a script-tag request, so whether it is sent depends on how the app sets up HttpClient. " +
                    "No method is generated for it.",
            ]);
        });

        it("keeps the key written as it is sent, wherever it stands", () => {
            // Declared first, `copy` is still not the method that is sent.
            const { paths, warnings } = extract({
                copy: { operationId: "lowerCopy" },
                Copy: { operationId: "mixedCopy" },
                COPY: { operationId: "upperCopy" },
            });

            expect(paths.map((p) => [p.method, p.operationId])).toEqual([["COPY", "upperCopy"]]);
            const also = "the path also declares a COPY operation, and method names are sent upper-cased.";
            expect(warnings).toEqual([
                `Operation "Copy" under \`additionalOperations\` of path "/pets/{id}" was skipped: ${also}`,
                `Operation "copy" under \`additionalOperations\` of path "/pets/{id}" was skipped: ${also}`,
            ]);
        });

        it("keeps the first of two keys when neither is written as it is sent", () => {
            const { paths, warnings } = extract({ copy: { operationId: "first" }, Copy: { operationId: "second" } });

            expect(paths.map((p) => [p.method, p.operationId])).toEqual([["COPY", "first"]]);
            expect(warnings).toEqual([
                'Operation "Copy" under `additionalOperations` of path "/pets/{id}" was skipped: the path also ' +
                    "declares a COPY operation, and method names are sent upper-cased.",
                'Operation "copy" under `additionalOperations` of path "/pets/{id}" is sent as COPY: Angular\'s ' +
                    "HttpClient upper-cases method names.",
            ]);
        });

        it("skips a method that has its own path-item field, and names the field", () => {
            const { paths, warnings } = extract({ POST: { operationId: "createPet" }, query: { operationId: "q" } });

            expect(paths).toEqual([]);
            expect(warnings).toEqual([
                'Operation "POST" under `additionalOperations` of path "/pets/{id}" was skipped: POST has its own ' +
                    "field on the path item, and OpenAPI does not allow it here. Declare the operation under `post`.",
                'Operation "query" under `additionalOperations` of path "/pets/{id}" was skipped: QUERY has its own ' +
                    "field on the path item, and OpenAPI does not allow it here. Declare the operation under `query`.",
            ]);
        });

        // TRACE has a field of its own, and is skipped there for the same
        // reason: sending the user to that field would get them nowhere.
        it.each(["CONNECT", "TRACK", "connect", "TRACE", "trace"])("skips %s: no browser sends it", (method) => {
            const { paths, warnings } = extract({ [method]: { operationId: "tunnel" } });

            expect(paths).toEqual([]);
            expect(warnings).toEqual([
                `Operation "${method}" under \`additionalOperations\` of path "/pets/{id}" was skipped: browsers ` +
                    `refuse to send ${method.toUpperCase()} requests, so no method is generated for it.`,
            ]);
        });

        it("skips a key that is not an HTTP method name, and an entry that is not an operation", () => {
            const { paths, warnings } = extract({
                "NOT A METHOD": { operationId: "a" },
                "": {},
                LINK: "nope",
                LOCK: null,
            });

            expect(paths).toEqual([]);
            expect(warnings).toEqual([
                'Operation "NOT A METHOD" under `additionalOperations` of path "/pets/{id}" was skipped: its key is ' +
                    "not a valid HTTP method name.",
                'Operation "" under `additionalOperations` of path "/pets/{id}" was skipped: its key is not a valid ' +
                    "HTTP method name.",
                'Operation "LINK" under `additionalOperations` of path "/pets/{id}" was skipped: it is not an ' +
                    "operation object.",
                'Operation "LOCK" under `additionalOperations` of path "/pets/{id}" was skipped: it is not an ' +
                    "operation object.",
            ]);
        });

        it("accepts any HTTP token as a method, punctuation included", () => {
            const { paths, warnings } = extract({
                "M-SEARCH": { operationId: "discover" },
                "X'1": { operationId: "x" },
            });

            expect(paths.map((p) => p.method)).toEqual(["M-SEARCH", "X'1"]);
            expect(warnings).toEqual([]);
        });

        it("skips a value that is not a map", () => {
            const { paths, warnings } = extract(["COPY"], { get: { operationId: "getPet" } });

            expect(paths.map((p) => p.operationId)).toEqual(["getPet"]);
            expect(warnings).toEqual([
                '`additionalOperations` of path "/pets/{id}" is not a map of HTTP methods to operations and was skipped.',
            ]);
        });
    });

    it("merges path-level parameters before operation parameters", () => {
        const paths = extractPaths({
            "/pets/{petId}": {
                parameters: [{ name: "petId", in: "path", schema: { type: "string" } }],
                get: {
                    operationId: "getPet",
                    parameters: [{ name: "verbose", in: "query", schema: { type: "boolean" } }],
                },
            },
        } as never);

        expect(paths[0].parameters?.map((p) => p.name)).toEqual(["petId", "verbose"]);
    });

    it("forces required=true for path parameters", () => {
        const paths = extractPaths({
            "/pets/{petId}": {
                get: {
                    parameters: [
                        { name: "petId", in: "path", schema: { type: "string" } },
                        { name: "verbose", in: "query", schema: { type: "boolean" } },
                    ],
                },
            },
        } as never);

        const [petId, verbose] = paths[0].parameters ?? [];
        expect(petId.required).toBe(true);
        expect(verbose.required).toBe(false);
    });

    it("defaults tags to an empty array and responses to an empty object", () => {
        const paths = extractPaths({ "/pets": { get: {} } } as never);
        expect(paths[0].tags).toEqual([]);
        expect(paths[0].responses).toEqual({});
    });

    it("returns an empty array for missing paths", () => {
        expect(extractPaths(undefined)).toEqual([]);
    });

    it("replaces $ref request bodies and responses with the component the resolver returns", () => {
        const body = { content: { "application/json": { schema: { type: "string" as const } } } };
        const ok = { description: "ok" };
        const paths = extractPaths(
            {
                "/pets": {
                    post: {
                        requestBody: { $ref: "#/components/requestBodies/B" },
                        responses: { "200": { $ref: "#/components/responses/Ok" }, "204": { description: "inline" } },
                    },
                },
            } as never,
            undefined,
            undefined,
            {
                requestBody: (ref) => (ref === "#/components/requestBodies/B" ? { value: body } : { problem: "x" }),
                response: (ref) => (ref === "#/components/responses/Ok" ? { value: ok } : { problem: "x" }),
            },
        );

        expect(paths[0].requestBody).toBe(body);
        expect(paths[0].responses).toEqual({ "200": ok, "204": { description: "inline" } });
    });

    it("skips a $ref its resolver cannot resolve, out loud, and keeps the rest of the operation", () => {
        const warnings: string[] = [];
        const paths = extractPaths(
            {
                "/pets": {
                    post: {
                        requestBody: { $ref: "#/components/requestBodies/B" },
                        responses: {
                            "200": { $ref: "#/components/responses/Ok" },
                            "204": { description: "inline" },
                            "400": { $ref: "#/components/responses/Bad" },
                        },
                    },
                },
            } as never,
            undefined,
            (message) => warnings.push(message),
            { requestBody: () => ({ problem: "is broken" }), response: () => ({ problem: "is broken" }) },
        );

        expect(paths[0].requestBody).toBeUndefined();
        expect(paths[0].responses).toEqual({ "204": { description: "inline" } });
        expect(warnings).toEqual([
            'The request body of (POST) /pets references "#/components/requestBodies/B", which is broken. The ' +
                "request body was skipped: generated methods take no body and no validator is generated for it.",
            'The "200" response of (POST) /pets references "#/components/responses/Ok", which is broken. The ' +
                "response was skipped: no validator is generated from it, and the method's return type and " +
                "response type come from its other success responses — `any`, read as JSON, if none is left.",
            'The "400" response of (POST) /pets references "#/components/responses/Bad", which is broken. The ' +
                "response was skipped: no validator is generated from it.",
        ]);
    });

    it("without resolvers, passes $ref bodies and responses through and skips $ref parameters, as before", () => {
        const warnings: string[] = [];
        const operation = {
            parameters: [{ $ref: "#/components/parameters/Limit" }],
            requestBody: { $ref: "#/components/requestBodies/B" },
            responses: { "200": { $ref: "#/components/responses/Ok" } },
        };
        const paths = extractPaths({ "/pets": { post: operation } } as never, undefined, (message) =>
            warnings.push(message),
        );

        expect(paths[0].parameters).toEqual([]);
        expect(paths[0].requestBody).toBe(operation.requestBody);
        expect(paths[0].responses).toEqual(operation.responses);
        expect(warnings).toEqual([
            'A parameter of (POST) /pets references "#/components/parameters/Limit", which cannot be resolved ' +
                "here: no reusable parameters were provided. The parameter was skipped.",
        ]);
    });

    it("still accepts the parameter-only resolver function of the old signature", () => {
        const paths = extractPaths(
            { "/pets": { get: { parameters: [{ $ref: "#/components/parameters/Limit" }] } } } as never,
            undefined,
            undefined,
            (ref) =>
                ref === "#/components/parameters/Limit"
                    ? { parameter: { name: "limit", in: "query" } }
                    : { problem: "x" },
        );

        expect(paths[0].parameters?.map((p) => p.name)).toEqual(["limit"]);
    });

    it("resolves path-level $ref parameters too", () => {
        const paths = extractPaths(
            {
                "/pets/{petId}": {
                    parameters: [{ $ref: "#/components/parameters/PetId" }],
                    get: { parameters: [{ name: "verbose", in: "query" }] },
                },
            } as never,
            undefined,
            undefined,
            { parameter: () => ({ value: { name: "petId", in: "path" } }) },
        );

        expect(paths[0].parameters?.map((p) => p.name)).toEqual(["petId", "verbose"]);
    });

    it("skips, out loud, a response that is not an object", () => {
        const warnings: string[] = [];
        const paths = extractPaths(
            { "/pets": { get: { responses: { "200": null, "404": { description: "inline" } } } } } as never,
            undefined,
            (message) => warnings.push(message),
        );

        expect(paths[0].responses).toEqual({ "404": { description: "inline" } });
        expect(warnings).toEqual([
            'The "200" response of (GET) /pets is not an object. The response was skipped: no validator is ' +
                "generated from it, and the method's return type and response type come from its other success " +
                "responses — `any`, read as JSON, if none is left.",
        ]);
    });
});
