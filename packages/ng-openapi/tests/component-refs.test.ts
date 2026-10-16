import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createOutputDirs, expectGeneratedCodeCompiles } from "@ng-openapi/testing";
import { generateFromConfig } from "ng-openapi";
import { HttpResourcePlugin } from "@ng-openapi/http-resource";
import { ZodPlugin } from "@ng-openapi/zod";

/**
 * Regression coverage for #132: responses and request bodies written as a
 * `$ref` to `components/responses` / `components/requestBodies` reached every
 * generator unresolved. The zod plugin crashed on them; the service and the
 * httpResource clients typed the response `any` and dropped the body.
 */

const outputDirs = createOutputDirs();
afterAll(outputDirs.cleanup);

function writeSpec(dir: string, spec: unknown): string {
    const input = join(dir, "spec.json");
    writeFileSync(input, JSON.stringify(spec));
    return input;
}

function read(output: string, ...path: string[]): string {
    return readFileSync(join(output, ...path), "utf8");
}

const json = (ref: string) => ({ "application/json": { schema: { $ref: ref } } });

/** The issue's repro, plus a referenced request body and a referenced binary download. */
const SPEC = {
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
        "/pets/{petId}": {
            get: {
                operationId: "getPet",
                tags: ["Pets"],
                parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    "200": { $ref: "#/components/responses/PetResponse" },
                    "4XX": { $ref: "#/components/responses/ClientError" },
                },
            },
        },
        "/pets": {
            post: {
                operationId: "createPet",
                tags: ["Pets"],
                requestBody: { $ref: "#/components/requestBodies/NewPet" },
                responses: { "201": { $ref: "#/components/responses/PetResponse" } },
            },
        },
        "/pets/{petId}/photo": {
            get: {
                operationId: "getPetPhoto",
                tags: ["Pets"],
                parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
                responses: { "200": { $ref: "#/components/responses/Photo" } },
            },
        },
    },
    components: {
        responses: {
            // A component may itself be a Reference Object.
            PetResponse: { $ref: "#/components/responses/PetBody" },
            PetBody: { description: "The pet.", content: json("#/components/schemas/Pet") },
            ClientError: { description: "Client error.", content: json("#/components/schemas/Error") },
            Photo: {
                description: "A photo.",
                content: { "image/png": { schema: { type: "string", format: "binary" } } },
            },
        },
        requestBodies: {
            NewPet: { required: true, content: json("#/components/schemas/Pet") },
        },
        schemas: {
            Pet: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
            Error: { type: "object", properties: { message: { type: "string" } } },
        },
    },
};

describe("$ref responses and request bodies (#132)", () => {
    it("resolves them for the service, the httpResource client and the zod validators", async () => {
        const output = outputDirs.create("component-refs-");
        const result = await generateFromConfig({
            input: writeSpec(output, SPEC),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
            plugins: [HttpResourcePlugin, ZodPlugin],
        });
        expect(result.warnings).toEqual([]);

        const service = read(output, "services", "pets.service.ts");
        expect(service).toMatch(/getPet\(petId: string, observe\?: 'body', [^)]*\): Observable<Pet>;/);
        expect(service).toMatch(/createPet\(pet: Pet, observe\?: 'body', [^)]*\): Observable<Pet>;/);
        expect(service).toMatch(/getPetPhoto\(petId: string, observe\?: 'body', [^)]*\): Observable<Blob>;/);
        expect(service).toContain("body: pet,");

        const resource = read(output, "resources", "pets.resource.ts");
        expect(resource).toMatch(/getPet\([^)]*\): HttpResourceRef<Pet \| undefined>/);

        const validators = read(output, "validators", "pets.validator.ts");
        expect(validators).toContain("export const getPet200Response =");
        expect(validators).toContain("export const getPet4XXResponse =");
        expect(validators).toContain("export const createPetBody =");
        expect(validators).toContain("export const createPet201Response =");

        expectGeneratedCodeCompiles(output);
    });

    it("skips, out loud, a ref that does not resolve, and still generates the rest of the operation", async () => {
        // `#/components/schemas/Error` names a schema, not a response: a
        // last-segment lookup returned that schema as the "response" and its
        // validator silently went missing.
        const output = outputDirs.create("component-refs-broken-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                ...SPEC,
                paths: {
                    "/pets": {
                        post: {
                            operationId: "createPet",
                            tags: ["Pets"],
                            requestBody: { $ref: "#/components/requestBodies/Missing" },
                            responses: {
                                "201": { $ref: "#/components/responses/PetResponse" },
                                "400": { $ref: "#/components/schemas/Error" },
                            },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
            plugins: [ZodPlugin],
        });

        expect(result.warnings).toEqual([
            'The request body of createPet ((POST) /pets) references "#/components/requestBodies/Missing", which ' +
                'does not resolve: there is no request body component named "Missing". The request body was ' +
                "skipped: generated methods take no body and no validator is generated for it.",
            'The "400" response of createPet ((POST) /pets) references "#/components/schemas/Error", which is not a ' +
                'response component pointer (expected "#/components/responses/<name>"). The response was skipped: ' +
                "no validator is generated from it.",
        ]);

        // The resolvable response is still generated; the skipped parts are not.
        const service = read(output, "services", "pets.service.ts");
        expect(service).toMatch(/createPet\(observe\?: 'body', [^)]*\): Observable<Pet>;/);
        const validators = read(output, "validators", "pets.validator.ts");
        expect(validators).toContain("export const createPet201Response =");
        expect(validators).not.toContain("createPetBody");
        expect(validators).not.toContain("createPet400Response");

        expectGeneratedCodeCompiles(output);
    });

    it("resolves path-level $ref parameters alongside $ref responses", async () => {
        // A path-level parameter that failed to resolve would leave {petId}
        // unbound and fail generation for the whole spec.
        const output = outputDirs.create("component-refs-path-params-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                ...SPEC,
                paths: {
                    "/pets/{petId}": {
                        parameters: [{ $ref: "#/components/parameters/PetId" }],
                        get: {
                            operationId: "getPet",
                            tags: ["Pets"],
                            responses: { "200": { $ref: "#/components/responses/PetResponse" } },
                        },
                    },
                },
                components: {
                    ...SPEC.components,
                    parameters: {
                        PetId: { name: "petId", in: "path", required: true, schema: { type: "string" } },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
            plugins: [ZodPlugin],
        });
        expect(result.warnings).toEqual([]);

        const service = read(output, "services", "pets.service.ts");
        expect(service).toMatch(/getPet\(petId: string, observe\?: 'body', [^)]*\): Observable<Pet>;/);
        expect(read(output, "validators", "pets.validator.ts")).toContain("export const getPet200Response =");

        expectGeneratedCodeCompiles(output);
    });

    it("generates from Swagger 2.0 top-level response refs", async () => {
        // The zod plugin crashed on these too. What they resolve to is pinned
        // in normalize.test.ts — 2.0 responses still type as `any` (their
        // `schema` is not mapped into `content`), so nothing here shows it.
        const output = outputDirs.create("component-refs-v2-");
        const result = await generateFromConfig({
            input: writeSpec(output, {
                swagger: "2.0",
                info: { title: "t", version: "1" },
                definitions: { Pet: { type: "object", properties: { name: { type: "string" } } } },
                responses: { NotFound: { description: "Not found." } },
                paths: {
                    "/pets": {
                        get: {
                            operationId: "listPets",
                            tags: ["Pets"],
                            responses: { "200": { description: "OK" }, "404": { $ref: "#/responses/NotFound" } },
                        },
                    },
                },
            }),
            output,
            options: { dateType: "string", enumStyle: "union", generateServices: true },
            plugins: [ZodPlugin],
        });
        expect(result.warnings).toEqual([]);
        expectGeneratedCodeCompiles(output);
    });
});
