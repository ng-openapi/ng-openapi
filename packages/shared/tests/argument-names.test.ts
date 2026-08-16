import { describe, expect, it } from "vitest";
import {
    MethodGenOptions,
    NormalizedOperation,
    Parameter,
    RESOURCE_RESERVED_ARGUMENT_NAMES,
    resolveArgumentNames,
    SERVICE_RESERVED_ARGUMENT_NAMES,
} from "../src";

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

const service = (op: NormalizedOperation) => resolveArgumentNames(op, config, SERVICE_RESERVED_ARGUMENT_NAMES);

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

        const resource = resolveArgumentNames(withRequestOptions, config, RESOURCE_RESERVED_ARGUMENT_NAMES);
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
});
