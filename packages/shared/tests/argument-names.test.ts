import { describe, expect, it } from "vitest";
import { argumentNameOf, resolveArgumentNames } from "../src";

describe("resolveArgumentNames", () => {
    it("camelCases wire names that do not collide", () => {
        expect(resolveArgumentNames(["group_id", "filter.name"])).toEqual({
            group_id: "groupId",
            "filter.name": "filterName",
        });
    });

    it("keeps colliding wire names distinct, first declared wins", () => {
        expect(resolveArgumentNames(["filter[name]", "filter.name", "filterName"])).toEqual({
            "filter[name]": "filterName",
            "filter.name": "filterName2",
            filterName: "filterName3",
        });
    });

    it("avoids the identifiers the generated method already binds", () => {
        // `options` and `observe` are the method's own trailing parameters;
        // the rest are locals its body declares.
        expect(resolveArgumentNames(["options[]", "observe", "url", "params", "headers"])).toEqual({
            "options[]": "options2",
            observe: "observe2",
            url: "url2",
            params: "params2",
            headers: "headers2",
        });
    });

    it("maps a wire name appearing twice to one identifier", () => {
        // A path `id` and a query `id` are one method parameter, as the
        // generators' dedupe has always treated them.
        expect(resolveArgumentNames(["id", "id"])).toEqual({ id: "id" });
    });

    it("is stable regardless of how many collisions precede a name", () => {
        const resolved = resolveArgumentNames(["a.b", "a-b", "a_b", "ab"]);
        expect(new Set(Object.values(resolved)).size).toBe(4);
    });
});

describe("argumentNameOf", () => {
    it("reads the resolved identifier", () => {
        expect(argumentNameOf({ "filter.name": "filterName2" }, "filter.name")).toBe("filterName2");
    });

    it("falls back to the plain conversion for an unresolved name", () => {
        expect(argumentNameOf({}, "filter.name")).toBe("filterName");
    });
});
