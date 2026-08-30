import { describe, expect, it } from "vitest";
import {
    MethodGenOptions,
    NormalizedOperation,
    Parameter,
    RESOURCE_ARGUMENT_PROFILE,
    resolveArgumentNames,
    SERVICE_ARGUMENT_PROFILE,
} from "../src";
import type { RenamedArgument } from "../src";

const config: MethodGenOptions = { options: { dateType: "string" } };

const param = (name: string, location: Parameter["in"] = "query"): Parameter => ({ name, in: location }) as Parameter;

const operation = (overrides: Partial<NormalizedOperation> = {}): NormalizedOperation =>
    ({
        path: "/things",
        method: "GET",
        pathParams: [],
        queryParams: [],
        formDataFields: [],
        urlEncodedFields: [],
        parameters: [],
        responses: {},
        tags: [],
        ...overrides,
    }) as NormalizedOperation;

const service = (op: NormalizedOperation) => resolveArgumentNames(op, config, SERVICE_ARGUMENT_PROFILE);

describe("resolveArgumentNames", () => {
    it("camelCases wire names that do not collide", () => {
        const names = service(operation({ queryParams: [param("group_id"), param("filter.name")] }));
        expect(names.of("group_id")).toBe("groupId");
        expect(names.of("filter.name")).toBe("filterName");
        expect(names.renamed).toEqual([]);
    });

    it("keeps colliding wire names distinct, first declared wins", () => {
        const names = service(
            operation({ queryParams: [param("filter[name]"), param("filter.name"), param("filterName")] }),
        );
        expect(names.of("filter[name]")).toBe("filterName");
        expect(names.of("filter.name")).toBe("filterName2");
        expect(names.of("filterName")).toBe("filterName3");
        expect(names.renamed.map((entry) => entry.source)).toEqual(["filter.name", "filterName"]);
    });

    it("avoids the identifiers the generated method already binds", () => {
        const names = service(operation({ queryParams: [param("options[]"), param("observe"), param("headers")] }));
        expect(names.of("options[]")).toBe("options2");
        expect(names.of("observe")).toBe("observe2");
        expect(names.of("headers")).toBe("headers2");
    });

    /**
     * The reserved set belongs to the emitter, not the spec: the plugin binds
     * `resourceOptions`/`requestOptions` and no `observe`/`options`.
     */
    it("uses the caller's reserved set, not a shared union", () => {
        const withRequestOptions = operation({ queryParams: [param("request-options"), param("options")] });

        const resource = resolveArgumentNames(withRequestOptions, config, RESOURCE_ARGUMENT_PROFILE);
        expect(resource.of("request-options")).toBe("requestOptions2");
        expect(resource.of("options")).toBe("options");

        const core = service(withRequestOptions);
        expect(core.of("request-options")).toBe("requestOptions");
        expect(core.of("options")).toBe("options2");
    });

    /**
     * Wire names are untrusted spec text; an object literal would resolve these
     * off Object.prototype and drop the arguments entirely.
     */
    it("handles wire names that collide with Object.prototype members", () => {
        const names = service(
            operation({ queryParams: [param("constructor"), param("toString"), param("__proto__"), param("normal")] }),
        );
        expect(names.of("constructor")).toBe("constructor");
        expect(names.of("toString")).toBe("toString");
        expect(names.of("__proto__")).toBe("proto");
        expect(names.of("normal")).toBe("normal");
        expect(names.all).toHaveLength(4);
    });

    it("maps a wire name appearing twice to one identifier", () => {
        // A path `id` and a query `id` are one method parameter, as the
        // generators' dedupe has always treated them.
        const names = service(operation({ pathParams: [param("id", "path")], queryParams: [param("id")] }));
        expect(names.of("id")).toBe("id");
        expect(names.all).toEqual(["id"]);
    });

    it("reserves the JSON request body so a query param cannot land on it", () => {
        const names = service(
            operation({
                requestBody: { content: { "application/json": { schema: { type: "object" } } } },
                queryParams: [param("request_body")],
            } as Partial<NormalizedOperation>),
        );
        expect(names.body).toBe("requestBody");
        expect(names.of("request_body")).toBe("requestBody2");
    });

    it("renames a request body whose type name is already bound", () => {
        const names = service(
            operation({
                requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Options" } } } },
            } as Partial<NormalizedOperation>),
        );
        // `options` is the method's own trailing parameter.
        expect(names.body).toBe("options2");
    });

    it("falls back to the plain conversion for an unresolved name", () => {
        expect(service(operation()).of("filter.name")).toBe("filterName");
    });
    it("uniquifies an unresolved wire name against the identifiers already bound", () => {
        const names = service(operation({ queryParams: [param("class")] }));
        expect(names.of("class")).toBe("class2");
        // A bare camelCase fallback returned `class` — a syntax error, loud.
        // Uniquifying only against the reserved words returned `class2` and
        // aliased the parameter above, which compiles and sends the wrong value.
        expect(names.of("Class")).toBe("class3");
        expect(names.of("options")).not.toBe("options");
    });

    it("freezes the arrays it hands out", () => {
        const names = service(operation({ queryParams: [param("filter[name]"), param("filter.name"), param("id")] }));
        expect(() => (names.all as string[]).push("x")).toThrow();
        expect(() => (names.renamed as RenamedArgument[]).push({ source: "x", identifier: "y" })).toThrow();
        expect(() => (names.merged as string[]).push("x")).toThrow();
        expect(() => ((names.renamed[0] as RenamedArgument).source = "x")).toThrow();
    });

    it("freezes the profile singletons", () => {
        expect(() => ((SERVICE_ARGUMENT_PROFILE as { bindsRequestBody: boolean }).bindsRequestBody = false)).toThrow();
        expect(() => (SERVICE_ARGUMENT_PROFILE.reserved as string[]).push("x")).toThrow();
        expect(() => ((RESOURCE_ARGUMENT_PROFILE as { bindsRequestBody: boolean }).bindsRequestBody = true)).toThrow();
        expect(() => (RESOURCE_ARGUMENT_PROFILE.reserved as string[]).push("x")).toThrow();
    });
});
